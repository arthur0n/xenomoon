// Per-message bookkeeping on the SDK stream, extracted from session.js (line cap): track
// tool_use→agent, bridge background workers onto the board, deterministically close each
// sub-agent's own tasks when it finishes, surface auto-denials, and sweep stragglers at
// turn end. The mutable maps are explicit dependencies (owned by runSession) — no closure
// state lives here.
import { runningChip, emitRunning } from "./stream.js";
import {
  applyOp,
  addBackgroundTask,
  closeOpenByAgent,
  closeStragglerTasks,
} from "../features/tasks/tasks-store.js";

/** @typedef {import("../../lib/types.js").OutMsg} OutMsg */
/** @typedef {import("../../lib/types.js").RunningAgentWire} RunningChip */
/** @typedef {(obj: OutMsg) => void} Send */

/** Bridge a backgrounded sub-agent onto the persistent board as an in_progress
 * agent task, so background work shows in the right rail (not just the running
 * strip). Only run_in_background spawns are bridged; foreground sub-agents are
 * not (they'd clutter the board). Idempotent per task_id.
 * @param {{ taskId?: string, toolUseId?: string, desc?: string }} t
 * @param {{ bgSpawns: Set<string>, bgBoard: Map<string, string>, send: Send }} deps
 */
function bridgeStart(t, { bgSpawns, bgBoard, send }) {
  if (!t.taskId || !t.toolUseId || !bgSpawns.has(t.toolUseId) || bgBoard.has(t.taskId)) return;
  const title = (t.desc ?? "background task").slice(0, 200);
  const { list, id } = addBackgroundTask(title, "background worker", new Date().toISOString());
  bgBoard.set(t.taskId, id);
  send({ type: "tasks", tasks: list });
}

/** Settle a bridged background task when its worker finishes: completed → mark
 * done (auto-pruned next turn); failed/stopped → remove it.
 * @param {{ taskId?: string, status?: string }} t
 * @param {{ bgBoard: Map<string, string>, send: Send }} deps
 */
function bridgeSettle(t, { bgBoard, send }) {
  if (!t.taskId) return;
  const boardId = bgBoard.get(t.taskId);
  if (!boardId) return;
  bgBoard.delete(t.taskId);
  const now = new Date().toISOString();
  const list =
    t.status === "completed"
      ? applyOp({ op: "update", id: boardId, status: "done" }, now)
      : applyOp({ op: "remove", id: boardId }, now);
  send({ type: "tasks", tasks: list });
}

/** Close a finished sub-agent's own open tasks (its scratchpad), keyed by the
 * agent label recorded at task_started. task_notification fires for foreground
 * AND background sub-agents, so this deterministically restores the inline close
 * that the background change removed for foreground work — no LLM cooperation
 * needed. @param {string | undefined} taskId
 * @param {{ runningByTask: Map<string, RunningChip>, send: Send }} deps */
function settleAgentTasks(taskId, { runningByTask, send }, status = "") {
  if (!taskId) return;
  const chip = runningByTask.get(taskId);
  runningByTask.delete(taskId);
  if (!chip?.label) return;
  // Background hand-back: instant banner — the Hive's next streamed token can lag by seconds.
  const note = `⇠ ${chip.label} finished (${status}) — result handed to the Hive…`;
  if (chip.background && status) send({ type: "status", text: note });
  send({ type: "tasks", tasks: closeOpenByAgent(chip.label) });
}

/** Turn-end backstop: close any open sub-agent task whose owner is no longer
 * running — a foreground straggler whose task_notification never arrived (e.g. a
 * hard interrupt). Live sub-agents (incl. background workers) and the
 * orchestrator's own cross-turn board are preserved.
 * @param {{ runningByTask: Map<string, RunningChip>, send: Send }} deps */
function sweepStragglers({ runningByTask, send }) {
  const chips = [...runningByTask.values()];
  const list = closeStragglerTasks(
    new Set(chips.map((v) => v.label)),
    chips.some((v) => v.background),
  );
  if (list) send({ type: "tasks", tasks: list });
}

// tool_use_id → short human-readable target (file path / notebook / command), so a later
// permission_denied can say WHAT was denied, not just which tool — the SDK's denied
// message carries no tool_input, but the tool_use crossed this stream first. Module-level
// with a FIFO cap: ids are globally unique (no cross-session collision) and the bound
// keeps a long session from leaking.
/** @type {Map<string, string>} */
const targetByTool = new Map();
const TARGET_CAP = 500;

/** Remember a tool_use's denial-display target (path first, else the command).
 * @param {string} id
 * @param {{ file_path?: string, notebook_path?: string, command?: string } | undefined} inp */
function rememberTarget(id, inp) {
  const target = inp?.file_path ?? inp?.notebook_path ?? inp?.command;
  if (!target) return;
  targetByTool.set(id, String(target).slice(0, 160));
  if (targetByTool.size > TARGET_CAP) {
    const oldest = targetByTool.keys().next().value;
    if (oldest !== undefined) targetByTool.delete(oldest);
  }
}

/** Record each tool_use → the agent that raised it (so canUseTool can label
 * concurrent approvals), its denial-display target, and note which spawns are
 * backgrounded.
 * @param {import("@anthropic-ai/claude-agent-sdk").SDKAssistantMessage} message
 * @param {{ agentByTool: Map<string, string>, bgSpawns: Set<string> }} deps */
function trackToolUses(message, { agentByTool, bgSpawns }) {
  const label = message.subagent_type ?? "main";
  for (const b of message.message?.content ?? []) {
    if (b.type === "tool_use" && b.id) {
      agentByTool.set(b.id, label);
      const inp =
        /** @type {{ run_in_background?: boolean, file_path?: string, notebook_path?: string, command?: string } | undefined} */ (
          b.input
        );
      if (inp?.run_in_background) bgSpawns.add(b.id);
      rememberTarget(b.id, inp);
    }
  }
}

/** Surface an SDK headless/auto-deny to the browser. When a backgrounded
 * (headless) sub-agent calls a tool that needs an interactive decision, the SDK
 * can't reach our canUseTool approver and auto-denies — see SDKPermissionDeniedMessage,
 * decision_reason_type "asyncAgent". Without this it dies as a silent is_error
 * deep in a sub-agent transcript; here it becomes a visible activity-log row (and
 * a banner for background denials) so the friction is identifiable, not silent.
 * @param {import("@anthropic-ai/claude-agent-sdk").SDKPermissionDeniedMessage} message
 * @param {{ agentByTool: Map<string, string>, send: Send }} deps */
function surfaceDenial(message, { agentByTool, send }) {
  // A backgrounded worker's tool_use may not be in agentByTool (it runs detached,
  // so its assistant messages don't all cross the parent stream) — fall back to a
  // "background" label rather than mislabeling the denial as the orchestrator.
  const background = message.decision_reason_type === "asyncAgent";
  const agent = agentByTool.get(message.tool_use_id) ?? (background ? "background" : "main");
  send({
    type: "permission_denied",
    toolName: message.tool_name,
    agent,
    // WHAT was denied (file path / command), when its tool_use crossed this stream —
    // a detached background worker's may not have, so the field is best-effort.
    target: targetByTool.get(message.tool_use_id),
    reason: message.decision_reason_type,
    background,
  });
}

/** Per-message bookkeeping on the SDK stream: track tool_use→agent, bridge
 * background workers onto the board, deterministically close each sub-agent's own
 * tasks when it finishes, surface auto-denials, and sweep stragglers at turn end.
 * @param {import("@anthropic-ai/claude-agent-sdk").SDKMessage} message
 * @param {{ agentByTool: Map<string, string>, bgSpawns: Set<string>, bgBoard: Map<string, string>, runningByTask: Map<string, RunningChip>, send: Send }} deps
 */
export function trackMessage(message, { agentByTool, bgSpawns, bgBoard, runningByTask, send }) {
  if (message.type === "assistant") {
    trackToolUses(message, { agentByTool, bgSpawns });
  } else if (message.type === "system" && message.subtype === "task_started") {
    // Record this sub-agent as live (label + display fields): settleAgentTasks closes its
    // tasks on notification, and the running snapshot carries it to the strip.
    if (message.task_id) {
      runningByTask.set(message.task_id, runningChip(message, bgSpawns));
      emitRunning(runningByTask, send);
    }
    bridgeStart(
      { taskId: message.task_id, toolUseId: message.tool_use_id, desc: message.description },
      { bgSpawns, bgBoard, send },
    );
  } else if (message.type === "system" && message.subtype === "task_notification") {
    bridgeSettle({ taskId: message.task_id, status: message.status }, { bgBoard, send });
    settleAgentTasks(message.task_id, { runningByTask, send }, message.status);
    emitRunning(runningByTask, send);
  } else if (message.type === "system" && message.subtype === "permission_denied") {
    surfaceDenial(message, { agentByTool, send });
  } else if (message.type === "result") {
    sweepStragglers({ runningByTask, send });
  }
}

/** Session-teardown settle: when the SDK stream ends or errors (the whole CLI
 * subprocess — and thus every in-flight background worker — is gone), remove each
 * bridged background board task and close each still-running sub-agent's tasks, so
 * the board doesn't keep a dead worker as in_progress forever.
 * @param {{ bgBoard: Map<string, string>, runningByTask: Map<string, RunningChip>, send: Send }} deps */
export function settleAllBackground({ bgBoard, runningByTask, send }) {
  for (const taskId of [...bgBoard.keys()]) {
    bridgeSettle({ taskId, status: "stopped" }, { bgBoard, send });
  }
  for (const taskId of [...runningByTask.keys()]) {
    settleAgentTasks(taskId, { runningByTask, send });
  }
}
