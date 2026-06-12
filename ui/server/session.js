// One WebSocket connection == one Claude Code session. The old ~140-line
// connection handler is decomposed here into small single-purpose helpers
// (logger, inbox, waitFor, canUseTool, run, client-message, close) so each
// stays well under the complexity/size limits.
import { createWriteStream } from "node:fs";
import path from "node:path";
import { createSdkMcpServer, query } from "@anthropic-ai/claude-agent-sdk";
import { parseJSON } from "../lib/json.js";
import { sessionHistory } from "./transcripts.js";
import { makeFormTool } from "./form-tool.js";
import {
  DEFAULT_POLICY,
  EDIT_TOOLS,
  FORM_TOOL,
  MODEL,
  ORCHESTRATOR_PROMPT,
  POLICIES,
  PROJECT_DIR,
  LOG_DIR,
} from "./config.js";

/** @typedef {import("../lib/types.js").OutMsg} OutMsg */
/** @typedef {import("../lib/types.js").Reply} Reply */
/** @typedef {import("../lib/types.js").ClientMsg} ClientMsg */
/** @typedef {import("../lib/types.js").WaitFor} WaitFor */
/** @typedef {import("@anthropic-ai/claude-agent-sdk").SDKUserMessage} SDKUserMessage */
/** @typedef {Map<number, { type: string, resolve: (value: Reply) => void }>} Pending */

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
  const iterable = (async function* () {
    while (!closed) {
      let next;
      while ((next = queue.shift())) yield next;
      await new Promise((resolve) => {
        wake = () => {
          resolve(undefined);
        };
      });
    }
  })();
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
 * @param {{ session: { policy: string }, sessionAllowed: Set<string>, waitFor: WaitFor, log: (dir: string, obj: OutMsg) => void }} deps
 * @returns {import("@anthropic-ai/claude-agent-sdk").CanUseTool}
 */
function makeCanUseTool({ session, sessionAllowed, waitFor, log }) {
  return async (toolName, input) => {
    if (toolName === "AskUserQuestion") {
      const answers = await waitFor("ask", { input });
      return { behavior: "allow", updatedInput: { ...input, ...answers } };
    }
    if (toolName === FORM_TOOL) {
      // The tool handler does the waiting; nothing to gate here.
      return { behavior: "allow", updatedInput: input };
    }
    if (
      session.policy === "all" ||
      (session.policy === "edits" && EDIT_TOOLS.has(toolName)) ||
      sessionAllowed.has(toolName)
    ) {
      log("auto", { type: "permission", toolName, policy: session.policy });
      return { behavior: "allow", updatedInput: input };
    }
    const { allow, always } = await waitFor("permission", { toolName, input });
    if (allow && always) sessionAllowed.add(toolName);
    return allow
      ? { behavior: "allow", updatedInput: input }
      : { behavior: "deny", message: "Denied from the web UI" };
  };
}

/**
 * Drive the Claude Code session and stream its messages to the browser.
 * @param {{ resumeId: string | null, policy: string, inbox: ReturnType<typeof createInbox>, send: (obj: OutMsg) => void, canUseTool: import("@anthropic-ai/claude-agent-sdk").CanUseTool, abort: AbortController, waitFor: WaitFor }} deps
 */
function runSession({ resumeId, policy, inbox, send, canUseTool, abort, waitFor }) {
  void (async () => {
    try {
      send({ type: "policy", value: policy });
      if (resumeId) {
        send({ type: "history", items: sessionHistory(resumeId) });
        send({ type: "status", text: `resumed session ${resumeId.slice(0, 8)}…` });
      } else {
        send({ type: "status", text: `session starting in ${PROJECT_DIR}` });
      }
      for await (const message of query({
        prompt: inbox.iterable,
        options: {
          ...(resumeId ? { resume: resumeId } : {}),
          cwd: PROJECT_DIR,
          // Pick up the project's .claude/ (agents, skills) and CLAUDE.md.
          settingSources: ["user", "project", "local"],
          model: MODEL,
          // Keep Claude Code's tooling behavior, append the orchestrator role.
          systemPrompt: { type: "preset", preset: "claude_code", append: ORCHESTRATOR_PROMPT },
          canUseTool,
          abortController: abort,
          mcpServers: {
            ui: createSdkMcpServer({
              name: "ui",
              version: "0.1.0",
              tools: [makeFormTool(waitFor)],
            }),
          },
        },
      })) {
        send({ type: "event", message });
      }
      send({ type: "status", text: "session ended" });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      send({ type: "status", text: `session error: ${reason}` });
    }
  })();
}

/**
 * @param {import("ws").RawData} raw
 * @param {{ log: (dir: string, obj: OutMsg) => void, inbox: ReturnType<typeof createInbox>, pending: Pending, session: { policy: string } }} deps
 */
function handleClientMessage(raw, { log, inbox, pending, session }) {
  /** @type {ClientMsg} */
  let msg;
  try {
    msg = /** @type {ClientMsg} */ (parseJSON(raw));
  } catch {
    return;
  }
  log("in", msg);
  if (msg.type === "user_input") {
    inbox.push({
      type: "user",
      parent_tool_use_id: null,
      message: { role: "user", content: [{ type: "text", text: msg.text }] },
    });
  } else if (msg.type === "reply") {
    const entry = pending.get(msg.id);
    if (entry) {
      entry.resolve(msg.payload);
      pending.delete(msg.id);
    }
  } else if (msg.type === "policy" && POLICIES.includes(msg.value)) {
    session.policy = msg.value;
  }
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
  const session = { policy: DEFAULT_POLICY };
  /** @type {Set<string>} */
  const sessionAllowed = new Set(); // tools approved with "Always" this session
  const abort = new AbortController(); // tears the CLI down on disconnect
  const waitFor = makeWaitFor(send, pending);
  const canUseTool = makeCanUseTool({ session, sessionAllowed, waitFor, log });

  runSession({ resumeId, policy: session.policy, inbox, send, canUseTool, abort, waitFor });

  ws.on("message", (raw) => {
    handleClientMessage(raw, { log, inbox, pending, session });
  });
  ws.on("close", () => {
    handleClose({ inbox, pending, abort, endLog: end });
  });
}
