// One WebSocket connection == one Claude Code session — but no longer one-to-one for its
// LIFETIME: the browser socket is swappable (connection.js Conn), a disconnect DETACHES rather
// than aborts, and a reconnecting client re-attaches to the same live session (registry.js), so
// in-flight sub-agents survive a blip. This file allocates the per-connection state and drives
// the SDK stream. The layers with clean seams live beside it: connection plumbing + detach/grace
// lifecycle (connection.js), stream bookkeeping (session-stream-tracker.js), the permission layer
// (session-permissions.js), browser-message dispatch (session-client-messages.js), and
// plugin resolution (session-plugins.js).
import { existsSync } from "node:fs";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { sessionHistory } from "../features/transcripts/transcripts.js";
import { buildUiServer } from "../mcp-tools/ui-server.js";
import { maybeKickoffOnboarding } from "./first-boot.js";
import { runWithRetry } from "./stream.js";
import { getLive } from "./registry.js";
import {
  createLogger,
  createInbox,
  makeWaitFor,
  buildSessionHooks,
  teardown,
  evaluateGrace,
  flushBuffer,
  replayPending,
  onSocketDetach,
} from "./connection.js";
import { readAutonomous } from "../features/autonomous/autonomous-store.js";
import { makeCheckLoop } from "../features/autonomous/autonomous-control.js";
import { registerSession } from "../features/pulse/pulse-control.js";
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
  getIssuekitBlock,
  getBranchModelBlock,
  getKimiBlock,
  getHermesConfig,
  getKimiConfig,
  PROJECT_DIR,
  FRAMEWORK_PLUGIN_DIR,
  CODEX_PLUGIN_DIR,
  getCodexConfig,
  AUTO_ALLOW_TOOLS,
} from "./config.js";

/** @typedef {import("../../lib/types.js").OutMsg} OutMsg */
/** @typedef {import("../../lib/types.js").Reply} Reply */
/** @typedef {import("../../lib/types.js").WaitFor} WaitFor */
/** @typedef {import("../../lib/types.js").RunningAgentWire} RunningChip */
/** @typedef {import("@anthropic-ai/claude-agent-sdk").SDKUserMessage} SDKUserMessage */
/** @typedef {import("./connection.js").Pending} Pending */
/** @typedef {import("./connection.js").Conn} Conn */
/** @typedef {import("./connection.js").LiveSession} LiveSession */
/** Per-connection mutable session state, shared between runSession and the client-message
 * handlers. `autonomousLoop` is set by runSession once the check loop is built.
 * @typedef {{ policy: string, query?: { interrupt?: () => Promise<void>, stopTask?: (taskId: string) => Promise<void> }, autonomousLoop?: { arm: (fireNow?: boolean) => void, disarm: () => void }, autonomousActive?: boolean, pulseId?: number, fetchedDocs?: Set<string> }} SessionState */

// Lift the CLI's built-in Bash tool timeout (default 120s, ceiling 600s): long gates
// (full validate, native builds) legitimately exceed 600s, and an agent killed mid-gate
// leaves uncommitted work + tempts the orchestrator to absorb the job. Default 10 min,
// ceiling 60 min; explicit env still wins.
const SESSION_ENV = {
  ...process.env,
  BASH_DEFAULT_TIMEOUT_MS: process.env.BASH_DEFAULT_TIMEOUT_MS ?? "600000",
  BASH_MAX_TIMEOUT_MS: process.env.BASH_MAX_TIMEOUT_MS ?? "3600000",
};

/** Everything appended to Claude Code's own preset: the orchestrator role, then the blocks that
 * describe THIS session's actual team and tools. Hermes/Kimi/Codex appear only when those
 * integrations are on, so the routing instructions never name a worker that is not there.
 * @param {boolean} codexOn @returns {string} */
function orchestratorAppend(codexOn) {
  return (
    getOrchestratorPrompt() +
    (getHermesConfig().enabled ? "\n\n" + getHermesBlock() : "") +
    (getKimiConfig().enabled ? "\n\n" + getKimiBlock() : "") +
    (codexOn ? "\n\n" + getCodexBlock() : "") +
    "\n\n" +
    getEconomicsBlock() +
    // Where issuekit actually lives. Static prose cannot carry a per-install absolute path, so the
    // session is told it once and every `issuekit …` in a skill or doc resolves through it.
    "\n\n" +
    getIssuekitBlock() +
    // The project's branch & merge doctrine (baked at install/onboarding); empty when it has none.
    (getBranchModelBlock() ? "\n\n" + getBranchModelBlock() : "")
  );
}

/**
 * Drive the Claude Code session and stream its messages to the browser.
 * @param {{ resumeId: string | null, inbox: ReturnType<typeof createInbox>, send: (obj: OutMsg) => void, canUseTool: import("@anthropic-ai/claude-agent-sdk").CanUseTool, abort: AbortController, waitFor: WaitFor, agentByTool: Map<string, string>, formAgentQueue: string[], session: SessionState, ls: LiveSession }} deps
 */
function runSession({
  resumeId,
  inbox,
  send,
  canUseTool,
  abort,
  waitFor,
  agentByTool,
  formAgentQueue,
  session,
  ls,
}) {
  /** @type {Set<string>} */
  const bgSpawns = new Set(); // tool_use ids spawned with run_in_background
  /** @type {Map<string, string>} */
  const bgBoard = new Map(); // sdk task_id -> bridged board task id
  /** @type {Map<string, RunningChip>} */
  const runningByTask = new Map(); // sdk task_id -> live sub-agent chip (authoritative running set)
  // `busy.value` lets the check loop skip ticks mid-turn AND drives the detach grace
  // (connection.js evaluateGrace). It lives on the LiveSession so the grace policy can read it;
  // stash loop on session so the control handler + autonomous tool can arm/disarm it.
  const busy = ls.busy;
  const checkLoop = makeCheckLoop({ push: inbox.push, send, isBusy: () => busy.value });
  const { onSessionId, onBusyChange } = buildSessionHooks({ ls, send, session, runningByTask });
  session.autonomousLoop = checkLoop;
  // Pulse is a PROCESS singleton (one timer for all connections), so a session only registers
  // itself as a possible delivery target — see features/pulse/pulse-control.js for why.
  session.pulseId = registerSession({ push: inbox.push, send, isBusy: () => busy.value });
  void (async () => {
    try {
      ls.resync(); // the same authoritative snapshots a re-attaching client gets
      maybeKickoffOnboarding(inbox.push);
      // Re-arm the check loop if a goal survived the reconnect (resync already sent the flag).
      // fireNow=true on resume: first interval tick is 5 min away
      checkLoop.arm((session.autonomousActive = readAutonomous().active));
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
              append: orchestratorAppend(codexOn),
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
        onSessionId,
        onBusyChange,
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
      // The stream is over for good (it only ends via abort/inbox-close at teardown, or an SDK
      // error). Tear down — drops it from the registry so a reconnect disk-resumes, not re-attaches
      // to a dead session. Idempotent: a disconnect-driven teardown already ran the grace timer.
      teardown(ls);
    }
  })();
}

/** Wire a socket's message + close handlers to a live session. The lifecycle helpers
 * (onSocketDetach / evaluateGrace / teardown / buffer flush) live in connection.js — bindSocket and
 * reattach stay here because they wire handleClientMessage (session-client-messages.js) with this
 * session's captured deps. @param {import("ws").WebSocket} ws @param {LiveSession} ls */
function bindSocket(ws, ls) {
  ws.on("message", (raw) => {
    handleClientMessage(raw, {
      log: ls.log,
      send: ls.send,
      inbox: ls.inbox,
      pending: ls.pending,
      session: ls.session,
    });
  });
  ws.on("close", () => {
    onSocketDetach(ws, ls);
  });
}

/** Re-bind a reconnecting browser to its still-running session: steal from any stale socket, swap
 * in the new one, cancel the grace timer, flush the detached buffer, then re-sync snapshots and
 * replay open approval cards — so the running sub-agents continue uninterrupted and a fully reloaded
 * page rebuilds its view. No second query is started. @param {LiveSession} ls @param {import("ws").WebSocket} ws */
function reattach(ls, ws) {
  const old = ls.conn.socket;
  if (old && old !== ws && old.readyState === old.OPEN) old.close(4000, "session re-attached");
  ls.conn.socket = ws;
  bindSocket(ws, ls);
  evaluateGrace(ls); // attached now → cancels any pending teardown
  ls.send({ type: "session", id: ls.id }); // (re)assert the client's reconnect key
  flushBuffer(ls);
  ls.resync();
  replayPending(ls);
  console.log(`[${ls.id ?? "pre-id"}] reattach — re-bound to live session`);
}

/** Wire up one browser connection. If it presents a `?resume=<id>` for a session still LIVE in the
 * registry (brief disconnect / laptop wake / refresh within the grace window), re-attach to it — the
 * sub-agents never died. Otherwise build a fresh session (disk-resume when `?resume` is set but the
 * session is gone: grace expired or server restarted).
 * @param {import("ws").WebSocket} ws @param {import("node:http").IncomingMessage} req */
export function handleConnection(ws, req) {
  const resumeId = new URL(req.url ?? "/", "http://localhost").searchParams.get("resume");

  const existing = getLive(resumeId);
  if (existing) {
    reattach(existing, ws);
    return;
  }

  /** @type {Conn} */
  const conn = { socket: ws, buffer: [] };
  const { log, send, end } = createLogger(conn);
  const inbox = createInbox();
  /** @type {Pending} */
  const pending = new Map();
  /** @type {SessionState} */
  const session = { policy: DEFAULT_POLICY };
  /** @type {Set<string>} */
  const sessionAllowed = new Set(); // tools approved with "Always" this session
  const abort = new AbortController(); // tears the CLI down at teardown (NOT on a mere disconnect)
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

  /** @type {LiveSession} */
  const ls = {
    id: resumeId,
    conn,
    inbox,
    pending,
    abort,
    session,
    busy: { value: false },
    send,
    log,
    endLog: end,
    graceTimer: null,
    announced: false,
    done: false,
    resync: () => {}, // replaced by runSession once its authoritative snapshots exist
  };

  bindSocket(ws, ls);
  runSession({
    resumeId,
    inbox,
    send,
    canUseTool,
    abort,
    waitFor,
    agentByTool,
    formAgentQueue,
    session,
    ls,
  });
}
