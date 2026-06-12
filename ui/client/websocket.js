// WebSocket session — owns the socket + `send`, and dispatches incoming
// server messages. The old single 40-branch onmessage is split here into one
// small per-type handler each, so every function stays well under the
// complexity limit.
import { $, $input } from "./dom.js";
import { parseJSON } from "../lib/json.js";
import { resumeId } from "./state.js";
import { addUser, addAgentMsg, addBanner } from "./chat.js";
import { addLog, VERB_KIND, toolDetail } from "./activity-log.js";
import { renderTodos } from "./todos.js";
import { renderAsk, renderPermission } from "./approvals.js";
import { renderForm } from "./form.js";
import { showRunning, hideRunning } from "./status-bar.js";
import { loadState } from "./project-tree.js";

/** @typedef {import("../lib/types.js").ServerMsg} ServerMsg */
/** @typedef {import("../lib/types.js").SdkEvent} SdkEvent */
/** @typedef {import("../lib/types.js").ContentBlock} ContentBlock */

const ws = new WebSocket(
  `ws://${location.host}${resumeId ? `?resume=${encodeURIComponent(resumeId)}` : ""}`,
);

/** Send a JSON message to the server. @param {object} o */
export function send(o) {
  ws.send(JSON.stringify(o));
}

/** @type {Map<string, string>} */
const subagents = new Map(); // spawn tool_use id -> agent name
let totalCost = 0;
let totalTokens = 0;

ws.onopen = () => {
  $("conn-dot").classList.add("pulse");
};
ws.onclose = () => {
  $("conn-dot").classList.remove("pulse");
  $("model-name").textContent = "disconnected";
  $("session-dot").classList.remove("pulse");
  $("session-meta").textContent = "ended — refresh for a new session";
};

/** @param {Extract<ServerMsg, { type: "history" }>} m */
function handleHistory(m) {
  for (const item of m.items ?? []) {
    if (item.role === "user") addUser(item.text);
    else addAgentMsg("main", item.text);
  }
}

/** @param {SdkEvent} msg */
function handleInit(msg) {
  $("model-name").textContent = msg.model ?? "";
  $("session-model").textContent = msg.model ?? "";
  $("session-dot").classList.add("pulse");
  $("session-meta").textContent = "running";
  addLog({ kind: "session", verb: "Sess", agent: "main", detail: msg.model });
}

/** @param {ContentBlock} b @param {string} who */
function handleToolUse(b, who) {
  if (b.name === "Task" || b.name === "Agent") {
    const label = b.input?.subagent_type ?? "agent";
    if (b.id) subagents.set(b.id, label);
    addLog({ kind: "spawn", agent: who, child: label, detail: b.input?.description ?? "" });
    showRunning(label, b.input?.description ?? "");
  } else if (b.name === "TodoWrite" && Array.isArray(b.input?.todos)) {
    renderTodos(b.input?.todos ?? []);
  } else {
    const verb = b.name === "mcp__ui__form" ? "Form" : b.name;
    addLog({
      kind: VERB_KIND[b.name ?? ""] ?? "task",
      verb,
      agent: who,
      detail: toolDetail(b.input),
    });
  }
}

/** @param {ContentBlock} b @param {string} who */
function handleBlock(b, who) {
  if (b.type === "text") {
    const full = b.text ?? "";
    if (full.trim()) {
      if (who === "main") addAgentMsg("main", full);
      else addLog({ kind: "say", agent: who, text: full.trim().slice(0, 200) });
    }
  }
  if (b.type === "tool_use") handleToolUse(b, who);
}

/** @param {SdkEvent} msg */
function handleAssistant(msg) {
  const who = subagents.get(msg.parent_tool_use_id ?? "") ?? "main";
  for (const b of msg.message?.content ?? []) handleBlock(b, who);
}

/** @param {SdkEvent} msg */
function handleResult(msg) {
  hideRunning();
  totalCost += msg.total_cost_usd ?? 0;
  const u = msg.usage ?? {};
  totalTokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0);
  $("usage").textContent = `$${totalCost.toFixed(2)} · ${(totalTokens / 1000).toFixed(1)}k tok`;
  $("session-meta").textContent = `idle · last turn ${((msg.duration_ms ?? 0) / 1000).toFixed(0)}s`;
  addLog({
    kind: "session",
    verb: "Sess",
    agent: "main",
    detail: `turn ${msg.subtype ?? ""} — $${(msg.total_cost_usd ?? 0).toFixed(3)}`,
  });
  void loadState(); // agents may have created files
}

/** @param {SdkEvent} msg */
function handleEvent(msg) {
  if (msg.type === "system" && msg.subtype === "init") handleInit(msg);
  else if (msg.type === "assistant") handleAssistant(msg);
  else if (msg.type === "result") handleResult(msg);
}

/** @param {MessageEvent} ev */
function handleMessage(ev) {
  const m = /** @type {ServerMsg} */ (parseJSON(ev.data));
  switch (m.type) {
    case "history":
      handleHistory(m);
      break;
    case "status":
      addBanner(m.text);
      break;
    case "policy":
      $input("mode-select").value = m.value;
      break;
    case "ask":
      renderAsk(m);
      break;
    case "form":
      renderForm(m);
      break;
    case "permission":
      renderPermission(m);
      break;
    case "event":
      handleEvent(m.message);
      break;
  }
}

ws.onmessage = handleMessage;
