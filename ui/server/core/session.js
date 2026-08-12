// One WebSocket connection == one Claude Code session. This file is the connection/
// lifecycle orchestrator: it allocates the per-connection mutable state (inbox, pending,
// session, abort) and drives the SDK stream. The layers with clean seams live beside it:
// stream bookkeeping (session-stream-tracker.js), the permission layer
// (session-permissions.js), browser-message dispatch (session-client-messages.js), and
// plugin resolution (session-plugins.js).
import { createWriteStream, existsSync } from "node:fs";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { sessionHistory } from "../features/transcripts/transcripts.js";
import { buildUiServer } from "../mcp-tools/ui-server.js";
import { maybeKickoffOnboarding } from "./first-boot.js";
import { emitRunning, runWithRetry } from "./stream.js";
import { readPromotions } from "../features/promotions/promotions-store.js";
import { readAutonomous } from "../features/autonomous/autonomous-store.js";
import { makeCheckLoop } from "../features/autonomous/autonomous-control.js";
import { readTasks } from "../features/tasks/tasks-store.js";
import { resolveSessionSkills } from "../features/skills/skills.js";
import { trackMessage, settleAllBackground } from "./session-stream-tracker.js";
import { makeCanUseTool } from "./session-permissions.js";
import { handleClientMessage } from "./session-client-messages.js";
import { resolveSessionPlugins } from "./session-plugins.js";

import {
  DEFAULT_POLICY,
  MODEL,
  EFFORT,
  getOrchestratorPrompt,
  getHermesBlock,
  getCodexBlock,
  getEconomicsBlock,
  getBranchModelBlock,
  getKimiBlock,
  getHermesConfig,
  getKimiConfig,
  PROJECT_DIR,
  FRAMEWORK_PLUGIN_DIR,
  CODEX_PLUGIN_DIR,
  getCodexConfig,
  AUTO_ALLOW_TOOLS,
  LOG_DIR,
} from "./config.js";

/** @typedef {import("../../lib/types.js").OutMsg} OutMsg */
/** @typedef {import("../../lib/types.js").Reply} Reply */
/** @typedef {import("../../lib/types.js").WaitFor} WaitFor */
/** @typedef {import("../../lib/types.js").RunningAgentWire} RunningChip */
/** @typedef {import("@anthropic-ai/claude-agent-sdk").SDKUserMessage} SDKUserMessage */
/** @typedef {Map<number, { type: string, resolve: (value: Reply) => void }>} Pending */
/** Per-connection mutable session state, shared between runSession and the client-message
 * handlers. `autonomousLoop` is set by runSession once the check loop is built.
 * @typedef {{ policy: string, query?: { interrupt?: () => Promise<void>, stopTask?: (taskId: string) => Promise<void> }, autonomousLoop?: { arm: (fireNow?: boolean) => void, disarm: () => void }, autonomousActive?: boolean, fetchedDocs?: Set<string> }} SessionState */

// Lift the CLI's built-in Bash tool timeout (default 120s, ceiling 600s): long gates
// (full validate, native builds) legitimately exceed 600s, and an agent killed mid-gate
// leaves uncommitted work + tempts the orchestrator to absorb the job. Default 10 min,
// ceiling 60 min; explicit env still wins.
const SESSION_ENV = {
  ...process.env,
  BASH_DEFAULT_TIMEOUT_MS: process.env.BASH_DEFAULT_TIMEOUT_MS ?? "600000",
  BASH_MAX_TIMEOUT_MS: process.env.BASH_MAX_TIMEOUT_MS ?? "3600000",
};

/** Per-connection NDJSON logger + the `send` that mirrors every outgoing
 * message into it. @param {import("ws").WebSocket} ws */
function createLogger(ws) {
  const sessionTag = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = path.join(LOG_DIR, `session-${sessionTag}.ndjson`);
  const logStream = createWriteStream(logFile, { flags: "a" });
  /** @param {string} dir @param {OutMsg} obj */
  const log = (dir, obj) => {
    logStream.write(JSON.stringify({ ts: new Date().toISOString(), dir, ...obj }) + "\n");
    const m = obj.message;
    const brief =
      obj.type === "event"
        ? `${m?.type ?? ""}${m?.subtype ? "/" + m.subtype : ""}`
        : (obj.type ?? "");
    console.log(`[${sessionTag}] ${dir} ${brief}`);
  };
  /** @param {OutMsg} obj */
  const send = (obj) => {
    log("out", obj);
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };
  console.log(`session log: ${logFile}`);
  return { log, send, end: () => logStream.end() };
}

/** The user side of the session: an async iterable the SDK consumes, fed by
 * the browser's user_input messages. */
function createInbox() {
  /** @type {SDKUserMessage[]} */
  const queue = [];
  /** @type {(() => void) | null} */
  let wake = null;
  let closed = false;
  // Re-iterable over a PERSISTENT queue: each [Symbol.asyncIterator]() mints a fresh
  // generator, so a 529-retry's second query() gets a live iterator after the SDK called
  // .return() on the first one at teardown. push/close and the `iterable` property are
  // unchanged, so every other consumer (check loop, hermesPush, board turns) is untouched.
  // Only one query() is ever live at a time, so two iterators never race on queue.shift().
  async function* gen() {
    while (!closed) {
      let next;
      while ((next = queue.shift())) yield next;
      if (closed) return;
      await new Promise((resolve) => {
        wake = () => {
          wake = null; // clear before resolving — a later push must never hit a stale resolver
          resolve(undefined);
        };
      });
    }
  }
  const iterable = { [Symbol.asyncIterator]: () => gen() };
  return {
    iterable,
    /** @param {SDKUserMessage} msg */
    push(msg) {
      queue.push(msg);
      wake?.();
    },
    close() {
      closed = true;
      wake?.();
    },
  };
}

/** @param {(obj: OutMsg) => void} send @param {Pending} pending @returns {WaitFor} */
function makeWaitFor(send, pending) {
  let nextId = 1;
  return (type, payload) => {
    const id = nextId++;
    send({ type, id, ...payload });
    return new Promise((resolve) => {
      pending.set(id, { type, resolve });
    });
  };
}

/**
 * Drive the Claude Code session and stream its messages to the browser.
 * @param {{ resumeId: string | null, policy: string, inbox: ReturnType<typeof createInbox>, send: (obj: OutMsg) => void, canUseTool: import("@anthropic-ai/claude-agent-sdk").CanUseTool, abort: AbortController, waitFor: WaitFor, agentByTool: Map<string, string>, formAgentQueue: string[], session: SessionState }} deps
 */
function runSession({
  resumeId,
  policy,
  inbox,
  send,
  canUseTool,
  abort,
  waitFor,
  agentByTool,
  formAgentQueue,
  session,
}) {
  /** @type {Set<string>} */
  const bgSpawns = new Set(); // tool_use ids spawned with run_in_background
  /** @type {Map<string, string>} */
  const bgBoard = new Map(); // sdk task_id -> bridged board task id
  /** @type {Map<string, RunningChip>} */
  const runningByTask = new Map(); // sdk task_id -> live sub-agent chip (authoritative running set)
  // `busy.value` lets the check loop skip ticks mid-turn; stash loop on session
  // so the control handler + autonomous tool can arm/disarm it.
  const busy = { value: false };
  const checkLoop = makeCheckLoop({ push: inbox.push, send, isBusy: () => busy.value });
  session.autonomousLoop = checkLoop;
  void (async () => {
    try {
      send({ type: "policy", value: policy });
      send({ type: "tasks", tasks: readTasks() });
      emitRunning(runningByTask, send); // reset the strip on (re)connect — set starts empty
      send({ type: "promotions", items: readPromotions() });
      maybeKickoffOnboarding(inbox.push);
      // Repaint the Autonomous flag + re-arm the check loop if a goal survived the reconnect.
      const autoState = readAutonomous();
      send({ type: "autonomousMode", payload: autoState });
      // fireNow=true on resume: first interval tick is 5 min away
      checkLoop.arm((session.autonomousActive = autoState.active));
      if (resumeId) {
        send({ type: "history", items: sessionHistory(resumeId) });
        send({ type: "status", text: `resumed session ${resumeId.slice(0, 8)}…` });
      } else {
        send({ type: "status", text: `session starting in ${PROJECT_DIR}` });
      }
      // The xenomoon spine ALWAYS loads; the OPTIONAL Codex reviewer plugin is appended only
      // when enabled AND vendored (see session-plugins.js — the one source of that gating).
      const codexOn = getCodexConfig().enabled && existsSync(CODEX_PLUGIN_DIR);
      const plugins = resolveSessionPlugins({
        baseDir: FRAMEWORK_PLUGIN_DIR,
        codexEnabled: getCodexConfig().enabled,
        codexDir: CODEX_PLUGIN_DIR,
      });
      // Wrapped so runWithRetry rebuilds it on each 529-retry attempt, resuming the SAME session.
      /** @param {string | null} resume */
      const makeQuery = (resume) =>
        query({
          prompt: inbox.iterable,
          options: {
            ...(resume ? { resume } : {}),
            // Every agent — orchestrator and all sub-agents, foreground or background — runs in this
            // one working tree. No per-agent git-worktree isolation, BY DESIGN: faster and simpler.
            // The trade-off: concurrent builders editing overlapping/adjacent files can race (one's
            // half-applied edit fails the other's verify gate, or clobbers its writes). We accept that
            // residual and mitigate it in the orchestrator's dispatch rules (orchestrator.md →
            // "Concurrent builders share one working tree"), not with isolation here.
            cwd: PROJECT_DIR,
            env: SESSION_ENV, // lifts the 600s Bash timeout — see SESSION_ENV above
            // The framework's agents/skills/hooks come from the plugin (single source of truth),
            // not from copies in the project — the project folder stays pure. Its slash commands
            // (`/codex:review`) expand from the user's prompt text, and its `codex:codex-rescue`
            // subagent becomes delegable when the Codex plugin is on. skipMcpDiscovery inside:
            // the UI owns its MCP tools (below). Capabilities namespace as `xenomoon:`.
            plugins,
            // The capability plugin (agents/skills/hooks) and its knowledge base (library/)
            // live OUTSIDE the project cwd. Mount it as an extra working root so researcher
            // agents can read it AND write new knowledge / promoted capabilities back into
            // the framework (the self-improvement loop). Gated by policy + hooks.
            additionalDirectories: [FRAMEWORK_PLUGIN_DIR],
            // Pick up the project's CLAUDE.md + any project-local .claude/ (project-specific
            // agents/skills the user hasn't promoted to the framework yet).
            settingSources: ["user", "project", "local"],
            // Bare-name pre-approval for the read/research/exec toolset, so a
            // BACKGROUNDED (headless) sub-agent — which has no approver and so auto-denies
            // anything not pre-approved — can actually research. Argument-scoped settings
            // rules (Bash(**), Read(**)) do NOT reach headless sub-agents; only bare names
            // do (see config.js). Bash stays safe via the destructive-* PreToolUse hooks.
            allowedTools: AUTO_ALLOW_TOOLS,
            model: MODEL,
            // Orchestrator routes more than it reasons; sub-agents override via their
            // own `effort:` frontmatter while active.
            effort: EFFORT,
            // Skill index = a tight allowlist (resolveSessionSkills): the framework meta floor
            // (caveman, quick) + the built-ins the user enabled via the skill wizard
            // (skillOverrides). DOMAIN skills are excluded — both the framework's domain-specific skills
            // and the project's own `.claude/skills` — because the orchestrator only routes; those
            // belong to the implementer agents. A context filter, not a sandbox: unlisted skills
            // stay on disk and remain loadable by the agents that list them.
            skills: resolveSessionSkills(),
            // Keep Claude Code's tooling behavior, append the orchestrator role.
            // Hermes and Codex blocks are injected only when those integrations are active,
            // so the orchestrator's routing instructions match the actual team each session.
            systemPrompt: {
              type: "preset",
              preset: "claude_code",
              append:
                getOrchestratorPrompt() +
                (getHermesConfig().enabled ? "\n\n" + getHermesBlock() : "") +
                (getKimiConfig().enabled ? "\n\n" + getKimiBlock() : "") +
                (codexOn ? "\n\n" + getCodexBlock() : "") +
                "\n\n" +
                getEconomicsBlock() +
                // The project's branch & merge doctrine (baked at install/onboarding);
                // empty string when the project has no branch-model file.
                (getBranchModelBlock() ? "\n\n" + getBranchModelBlock() : ""),
            },
            canUseTool,
            abortController: abort,
            mcpServers: {
              ui: buildUiServer({
                waitFor,
                formAgentQueue,
                send,
                hermesPush: inbox.push,
                disarm: checkLoop.disarm,
              }),
            },
          },
        });
      // Stream the session, auto-retrying a sustained API 529 every 5 min (resume, self-
      // stopping) instead of dying on the first overload. runWithRetry owns session.query
      // and the "session ended"/"resumed after overload" status; non-overload errors
      // propagate to the catch below.
      await runWithRetry({
        makeQuery,
        trackMessage,
        trackDeps: { agentByTool, bgSpawns, bgBoard, runningByTask, send },
        send,
        abort,
        busy,
        session,
        inbox,
        resumeId,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      send({ type: "status", text: `session error: ${reason}` });
    } finally {
      // Every exit path lands here — normal end, SDK error, or early iterator end. The
      // client clears `busy`/the running strip only on a `result`; an abnormal end emits
      // none, so settle dead background workers and signal idle to unstick the UI.
      settleAllBackground({ bgBoard, runningByTask, send });
      send({ type: "idle" });
    }
  })();
}

/**
 * Settle every pending interaction so canUseTool / the form handler return and
 * the CLI can finish its turn — an unresolved promise here leaves an orphaned
 * process holding the session, and its transcript ends mid-tool_use (which
 * 400s any later resume). Then stop the session and close the log.
 * @param {{ inbox: ReturnType<typeof createInbox>, pending: Pending, abort: AbortController, endLog: () => void }} deps
 */
function handleClose({ inbox, pending, abort, endLog }) {
  inbox.close();
  for (const { type, resolve } of pending.values()) {
    resolve(type === "permission" ? { allow: false } : { cancelled: true });
  }
  pending.clear();
  abort.abort();
  endLog();
}

/** Wire up one browser connection as a Claude Code session.
 * @param {import("ws").WebSocket} ws @param {import("node:http").IncomingMessage} req */
export function handleConnection(ws, req) {
  const resumeId = new URL(req.url ?? "/", "http://localhost").searchParams.get("resume");
  const { log, send, end } = createLogger(ws);
  const inbox = createInbox();
  /** @type {Pending} */
  const pending = new Map();
  /** @type {SessionState} */
  const session = { policy: DEFAULT_POLICY };
  /** @type {Set<string>} */
  const sessionAllowed = new Set(); // tools approved with "Always" this session
  const abort = new AbortController(); // tears the CLI down on disconnect
  /** @type {Map<string, string>} */
  const agentByTool = new Map(); // tool_use id -> agent label (main | subagent_type)
  /** @type {string[]} */
  const formAgentQueue = []; // FIFO: agent label per pending mcp__ui__form call
  const waitFor = makeWaitFor(send, pending);
  const canUseTool = makeCanUseTool({
    session,
    sessionAllowed,
    waitFor,
    log,
    agentByTool,
    formAgentQueue,
  });

  runSession({
    resumeId,
    policy: session.policy,
    inbox,
    send,
    canUseTool,
    abort,
    waitFor,
    agentByTool,
    formAgentQueue,
    session,
  });

  ws.on("message", (raw) => {
    handleClientMessage(raw, { log, send, inbox, pending, session });
  });
  ws.on("close", () => {
    // Stop the check loop so it never pushes into a closed inbox or writes for a dead session.
    session.autonomousLoop?.disarm();
    handleClose({ inbox, pending, abort, endLog: end });
  });
}
