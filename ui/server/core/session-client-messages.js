// Browser → server message dispatch, extracted from session.js (line cap): user turns,
// approval replies, board mutations, promotions, and session-control (compact / stop /
// stop_task / autonomous toggle). Operates on the per-connection state session.js owns,
// passed as explicit dependencies.
import { parseJSON } from "../../lib/json.js";
import { cancelKimiBoardTask } from "../mcp-tools/kimi-tool.js";
import { userInputTurn } from "./user-input.js";
import { readPromotions, decide, markPromoted } from "../features/promotions/promotions-store.js";
import { promoteOne } from "../features/promotions/promote-run.js";
import { handleAutonomousControl } from "../features/autonomous/autonomous-control.js";
import { armPulse, disarmPulse } from "../features/pulse/pulse-store.js";
import { beatNow, publish, noteHumanActivity } from "../features/pulse/pulse-control.js";
import { applyOp, pruneDoneTasks } from "../features/tasks/tasks-store.js";
import { POLICIES, PROJECT_DIR } from "./config.js";

/** @typedef {import("../../lib/types.js").OutMsg} OutMsg */
/** @typedef {import("../../lib/types.js").ClientMsg} ClientMsg */
/** @typedef {import("../../lib/types.js").Reply} Reply */
/** @typedef {import("../../lib/types.js").Task} Task */
/** @typedef {import("./session.js").SessionState} SessionState */
/** @typedef {import("@anthropic-ai/claude-agent-sdk").SDKUserMessage} SDKUserMessage */
/** The inbox surface this dispatcher needs (the full inbox lives in session.js).
 * @typedef {{ push: (msg: SDKUserMessage) => void }} InboxLike */
/** @typedef {Map<number, { type: string, resolve: (value: Reply) => void }>} Pending */
/** @typedef {(obj: OutMsg) => void} Send */

/** Execute an approved promotion: move the capability project→plugin and mark it
 * promoted, all server-side, so the user's one click on the board IS the
 * deliberate promotion (no orchestrator round-trip, no raw shell). A skip
 * (already in the plugin, source missing) leaves the entry approved and reports
 * why. @param {string} id @param {Send} send */
function runPromotion(id, send) {
  const entry = readPromotions().find((p) => p.id === id && p.status === "approved");
  if (!entry) {
    send({ type: "promotions", items: readPromotions() });
    return;
  }
  const result = promoteOne(entry.kind, entry.name, PROJECT_DIR);
  const items = result.ok ? markPromoted(id, new Date().toISOString()) : readPromotions();
  send({ type: "promotions", items });
  send({
    type: "status",
    text: result.ok
      ? `Promoted ${entry.kind.replace(/s$/, "")} "${entry.name}" → the active domain pack. Start a new session to load it.`
      : `Couldn't promote "${entry.name}": ${result.msg}`,
  });
}

/** The synthetic user turn that pushes a freshly answered async question back to
 * the orchestrator the moment the user replies — so the answer is delivered, not
 * polled (kills the "answered question left unread" stall). Same shape as a real
 * user message / Hermes findingsTurn. @param {Task} task @returns {SDKUserMessage} */
function answerTurn(task) {
  return {
    type: "user",
    parent_tool_use_id: null,
    message: {
      role: "user",
      content: [
        {
          type: "text",
          text:
            `[User answered question ${task.id} — "${task.title}"]\n\nAnswer: ${task.answer}\n\n` +
            "Act on this now: relay/apply it and move dependent work. (Already marked done on the board.)",
        },
      ],
    },
  };
}

/** Board mutations that simply mutate a store and rebroadcast: a task status/removal
 * (task_update), a promotion approve/reject (promotion_decide), or running an
 * approved promotion (promotion_run). Split out of handleClientMessage to keep its
 * branch complexity in check. Returns true if handled.
 * @param {ClientMsg} msg @param {Send} send @param {InboxLike} inbox @returns {boolean} */
function handleBoardMessage(msg, send, inbox) {
  if (msg.type === "task_update") {
    // Removing a Kimi run's board task IS its interrupt — cancel the ACP run first
    // (no-op for every other task id).
    if (msg.op === "remove" && cancelKimiBoardTask(msg.id)) {
      send({ type: "status", text: "cancelling the Kimi run tied to that task…" });
    }
    const list = applyOp(msg, new Date().toISOString());
    send({ type: "tasks", tasks: list });
    // Push the answer to the orchestrator instead of relying on it to scan the
    // board. Only on an actual answer submission, and only for async questions,
    // so status toggles / removals / re-clicks don't spawn spurious turns.
    if (msg.answer != null) {
      const task = list.find((t) => t.id === msg.id);
      if (task?.kind === "question") {
        inbox.push(answerTurn(task));
        send({ type: "status", text: `⇠ answer to ${task.id} received — the Hive is resuming…` }); // instant banner
      }
    }
    return true;
  }
  if (msg.type === "promotion_decide") {
    send({ type: "promotions", items: decide(msg.id, msg.decision, new Date().toISOString()) });
    return true;
  }
  if (msg.type === "promotion_run") {
    runPromotion(msg.id, send);
    return true;
  }
  return false;
}

/** Session-control messages: compact (trim transcript in place), stop (interrupt
 * the turn), stop_task (kill one background worker). Split out of handleClientMessage
 * to keep its branch complexity in check.
 * @param {ClientMsg} msg
 * @param {{ send: Send, inbox: InboxLike, session: SessionState }} deps */
function handleControlMessage(msg, { send, inbox, session }) {
  if (msg.type === "compact") {
    // Trim the orchestrator's transcript in place: push the /compact slash command
    // as a user turn (the SDK processes slash commands). This summarizes history and
    // sheds the bulk while keeping the SAME session alive — plugin, skills, warm
    // cache and the task board all survive (unlike "+ new", a full cold restart).
    inbox.push({
      type: "user",
      parent_tool_use_id: null,
      message: { role: "user", content: [{ type: "text", text: "/compact" }] },
    });
    send({
      type: "status",
      text: "compacting the session — trimming transcript, keeping context…",
    });
  } else if (msg.type === "stop") {
    // Interrupt the current turn — stops in-flight sub-agents but keeps the
    // session alive for the next input.
    void session.query?.interrupt?.();
    send({ type: "status", text: "stopping the current turn — interrupting running agents…" });
  } else if (msg.type === "stop_task") {
    // Stop ONE backgrounded Xenomoon by its task id; the hive turn and any other
    // background workers keep running. The SDK emits a task_notification:stopped.
    void session.query?.stopTask?.(msg.taskId);
    send({ type: "status", text: `stopping background agent ${msg.taskId}…` });
  } else if (msg.type === "pulse_mode") {
    // Pulse toggle. Zero-config by design — no goal to author, unlike Autonomous — so this is
    // just on/off/beat-now. It must NEVER touch session.autonomousActive: that flag auto-allows
    // every tool, and Pulse is a nudge, not a permission escalation.
    const now = new Date().toISOString();
    if (msg.action === "start") {
      armPulse(now);
      send({ type: "status", text: "Pulse armed — watching for work that hasn't landed." });
      publish();
      void beatNow(); // sweep immediately, don't wait a full interval
    } else if (msg.action === "stop") {
      disarmPulse(now);
      send({ type: "status", text: "Pulse off." });
      publish();
    } else {
      void beatNow();
    }
  } else if (session.autonomousLoop) {
    // Toggle the standing Main Goal (start/stop) — persists, broadcasts the flag, pushes
    // the kickoff turn, and arms/disarms the 5-minute check loop. No-op for any other msg.
    if (handleAutonomousControl(msg, { send, push: inbox.push, loop: session.autonomousLoop }))
      session.autonomousActive = /** @type {{ action: string }} */ (msg).action === "start";
  }
}

/**
 * @param {import("ws").RawData} raw
 * @param {{ log: (dir: string, obj: OutMsg) => void, send: Send, inbox: InboxLike, pending: Pending, session: SessionState }} deps
 */
export function handleClientMessage(raw, { log, send, inbox, pending, session }) {
  /** @type {ClientMsg} */
  let msg;
  try {
    msg = /** @type {ClientMsg} */ (parseJSON(raw));
  } catch {
    return;
  }
  log("in", msg);
  if (msg.type === "user_input") {
    // A new user turn — prune completed agent tasks so the board reflects live
    // work instead of accumulating a graveyard of done items across the session.
    const pruned = pruneDoneTasks();
    if (pruned) send({ type: "tasks", tasks: pruned });
    // Pasted images ride along as base64 image blocks ahead of the text.
    inbox.push(userInputTurn(msg));
    // Any human turn makes THIS session the Pulse delivery target and silently wakes a sleeping
    // Pulse — sleep is not off, so nobody has to remember to switch it back on.
    if (session.pulseId != null) noteHumanActivity(session.pulseId);
  } else if (msg.type === "reply") {
    const entry = pending.get(msg.id);
    if (entry) {
      entry.resolve(msg.payload);
      pending.delete(msg.id);
    }
  } else if (msg.type === "policy" && POLICIES.includes(msg.value)) {
    session.policy = msg.value;
  } else if (handleBoardMessage(msg, send, inbox)) {
    // A board mutation (task status/removal, or a promotion approve/reject) —
    // handled and rebroadcast inside the helper.
  } else {
    handleControlMessage(msg, { send, inbox, session });
  }
}
