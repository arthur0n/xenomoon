// Persistent task store — the orchestrator's working to-do list, kept in a
// local JSON file next to the project project so it survives across sessions
// (resume). Pure disk module: no per-connection state, re-read/written on each
// mutation. The MCP `tasks` tool (task-tool.js) and the user's `task_update`
// messages (session.js) both funnel through applyOp.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../../lib/json.js";
import { PROJECT_DIR } from "../../core/config.js";
import {
  DISPLAY_NAMES,
  FIX_LIMIT,
  TRIAGE_LIMIT,
  allowedMoves,
  canonicalIssue,
  fromLegacyTitle,
  move,
  start,
  title as flowTitle,
} from "./flow-machine.js";

/** @typedef {import("../../../lib/types.js").Task} Task */
/** @typedef {import("../../../lib/types.js").FlowState} FlowState */

const OWNERS = new Set(["agent", "user"]);
const STATUSES = new Set(["pending", "in_progress", "done"]);

/** @returns {string} */
const tasksDir = () => path.join(PROJECT_DIR, ".xenomoon");
/** @returns {string} */
const tasksPath = () => path.join(tasksDir(), "tasks.json");

/** Wipe `.xenomoon/handoffs/` — the transient builder→orchestrator report files. Called
 * once at server boot: by the time we restart, every prior-session handoff has been
 * consumed (summarized + relayed), so a blanket delete is safe and deterministic with no
 * manifest. The dir is recreated lazily on the next builder's Write. `force` no-ops when
 * the dir is absent. */
export function reapHandoffs() {
  rmSync(path.join(tasksDir(), "handoffs"), { recursive: true, force: true });
}

/** Read the persisted list; an absent or corrupt file is an empty list.
 * @returns {Task[]} */
export function readTasks() {
  try {
    const parsed = parseJSON(readFileSync(tasksPath(), "utf8"));
    return Array.isArray(parsed) ? /** @type {Task[]} */ (parsed) : [];
  } catch {
    return [];
  }
}

/** @param {Task[]} list */
function writeTasks(list) {
  mkdirSync(tasksDir(), { recursive: true });
  writeFileSync(tasksPath(), JSON.stringify(list, null, 2) + "\n");
}

/** Next `t<n>` id, one past the highest numeric suffix in use.
 * @param {Task[]} list @returns {string} */
function nextId(list) {
  const max = list.reduce((m, t) => {
    const n = Number(String(t.id).replace(/^t/, ""));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `t${max + 1}`;
}

/** @param {Task[]} list @param {{ title?: string, owner?: string, note?: string, status?: string, agent?: string, kind?: Task["kind"], options?: string[], answer?: string }} spec @param {string} now @returns {Task} */
function makeTask(list, spec, now) {
  return {
    id: nextId(list),
    title: String(spec.title ?? "untitled").slice(0, 200),
    owner: OWNERS.has(spec.owner ?? "") ? /** @type {Task["owner"]} */ (spec.owner) : "agent",
    status: STATUSES.has(spec.status ?? "")
      ? /** @type {Task["status"]} */ (spec.status)
      : "pending",
    note: spec.note ? String(spec.note).slice(0, 500) : undefined,
    // Which agent created this task, so the server can deterministically close a
    // sub-agent's open tasks when it finishes (see closeOpenByAgent). "main" =
    // orchestrator; "background" = a bridged background worker; otherwise the
    // sub-agent's subagent_type. Internal — the client renderer ignores it.
    agent: spec.agent ? String(spec.agent).slice(0, 80) : undefined,
    // Async-question fields (mcp__ui__ask). Absent on ordinary tasks.
    ...(spec.kind === "question" || spec.kind === "objective" ? { kind: spec.kind } : {}),
    ...(Array.isArray(spec.options) && spec.options.length
      ? { options: spec.options.map((o) => String(o).slice(0, 120)).slice(0, 8) }
      : {}),
    ...(spec.answer != null ? { answer: String(spec.answer).slice(0, 1000) } : {}),
    created: now,
  };
}

/** Who asked for a board mutation. `by: "owner"` is passed ONLY by the browser board handler
 * (session-client-messages.js): the owner's click is the one path allowed to remove an open
 * flow task. Every other caller passes nothing and is treated as not the owner.
 * @typedef {{ by?: "owner" }} OpOrigin */

/**
 * Apply one mutation and persist. Returns the new list (caller broadcasts it).
 * Unknown ids are ignored so a stale UI click can't throw.
 * @param {{ op: string, title?: string, owner?: string, note?: string, status?: string, id?: string, _by?: string, answer?: string, tasks?: Array<{ title?: string, owner?: string, note?: string }> }} op
 * @param {string} now ISO timestamp (the caller stamps it — keeps this testable)
 * @param {OpOrigin} [origin] default: not the owner
 * @returns {Task[]}
 */
export function applyOp(op, now, origin = {}) {
  return applyTaskOp(op, now, origin).list;
}

/** An open flow task — the durable state of one issue in the flow (see setFlow).
 * @param {Task | undefined} t @returns {boolean} */
const isOpenFlow = (t) => t?.kind === "flow" && t.status !== "done";

/** `#84 · Design · …` → "84": how a title-only flow task (written before FlowState) is found. */
const FLOW_TITLE = /^#(\d+)\s*·/;
/** The canonical issue of a flow task: its FlowState, else its `#N ·` title prefix.
 * @param {Task} t @returns {string | undefined} */
const flowIssueOf = (t) => t.flow?.issue ?? canonicalIssue(FLOW_TITLE.exec(t.title)?.[1]);
const FLOW_CALL = '{op:"flow", issue:84, to:"design"}';

/** Why a generic op on a flow task is refused, or undefined. Nobody updates a flow task, open
 * or done (a done one reopened would duplicate its issue). Only the owner (browser board)
 * removes an open one; a done one is a finished row anyone may drop.
 * @param {Task[]} list @param {{ op: string, id?: string }} op @param {OpOrigin} origin
 * @returns {string | undefined} */
function flowGuard(list, op, origin) {
  const target = list.find((t) => t.id === op.id);
  if (
    (op.op === "update" && target?.kind === "flow") ||
    (op.op === "remove" && origin.by !== "owner" && isOpenFlow(target))
  ) {
    const what = isOpenFlow(target) ? "an open flow task" : "a flow task";
    return `op "${op.op}" refused: ${op.id} is ${what}; only op "flow" changes it (op "flow" with to "done", from proof, closes it), and only the owner can remove an open one from the board.`;
  }
  return undefined;
}

/**
 * applyOp with the refusal reason. A refused op leaves the board unchanged and is not
 * written; `error` says why (a flow budget refusal is the one exception: its forced
 * waiting state IS written). `info` is op "flow"'s status line. Every board mutation
 * path (tasks tool, browser task_update) goes through here, so the flow-task guard
 * lives here and nowhere else.
 * @param {{ op: string, title?: string, owner?: string, note?: string, status?: string, id?: string, _by?: string, answer?: string, issue?: string | number, to?: string, tasks?: Array<{ title?: string, owner?: string, note?: string }> }} op
 * @param {string} now
 * @param {OpOrigin} [origin] default: not the owner
 * @returns {{ list: Task[], error?: string, info?: string }}
 */
export function applyTaskOp(op, now, origin = {}) {
  let list = readTasks();
  if (op.op === "flow") {
    const res = setFlow(list, op, now);
    if (res.list !== list) writeTasks(res.list);
    return res;
  }
  const refused = flowGuard(list, op, origin);
  if (refused) return { list, error: refused };
  if (op.op === "objective") {
    list = setObjective(list, op, now);
  } else if (op.op === "add") {
    const specs = Array.isArray(op.tasks) ? op.tasks : [op];
    for (const spec of specs) {
      // `_by` (the creating agent) rides on the top-level op — inject it into
      // every spec, including each entry of a batch add, for closeOpenByAgent.
      const task = makeTask(list, { ...spec, agent: op._by }, now);
      list.push(task);
    }
  } else if (op.op === "update") {
    list = list.map((t) => {
      if (t.id !== op.id) return t;
      return {
        ...t,
        ...(op.title != null ? { title: String(op.title).slice(0, 200) } : {}),
        ...(op.note != null ? { note: String(op.note).slice(0, 500) } : {}),
        ...(op.status != null && STATUSES.has(op.status)
          ? { status: /** @type {Task["status"]} */ (op.status) }
          : {}),
        ...(op.owner != null && OWNERS.has(op.owner)
          ? { owner: /** @type {Task["owner"]} */ (op.owner) }
          : {}),
        // Answering an async question resolves it: record the answer and mark it
        // done (so the board stops nagging; the orchestrator reads it next turn).
        ...(op.answer != null
          ? {
              answer: String(op.answer).slice(0, 1000),
              status: /** @type {Task["status"]} */ ("done"),
            }
          : {}),
      };
    });
  } else if (op.op === "remove") {
    list = list.filter((t) => t.id !== op.id);
  }
  writeTasks(list);
  return { list };
}

/** The status line of op "flow": where the issue is now and the ids it may move to.
 * @param {FlowState} s @param {boolean} placed @param {boolean} done @returns {string} */
function flowLine(s, placed, done) {
  if (done) return `#${s.issue} is Done; its flow task is closed.`;
  const name = DISPLAY_NAMES[s.at] ?? s.at;
  const from = s.from ? ` (from ${DISPLAY_NAMES[s.from] ?? s.from})` : "";
  const where = placed ? `placed at ${name}` : `is at ${name}${from}`;
  return `#${s.issue} ${where} (triage ${s.triage}/${TRIAGE_LIMIT}, fix ${s.fix}/${FIX_LIMIT}). Allowed next: ${allowedMoves(s).join(", ") || "none"}.`;
}

/** The move asked of an open flow task, or why there is none (title-only task upgraded first).
 * @param {Task} open @param {string} issue @param {string | undefined} to
 * @returns {{ state?: FlowState, error?: string, done?: boolean }} */
function moveOpen(open, issue, to) {
  const current = open.flow ?? fromLegacyTitle(open.title);
  if (!current)
    return {
      error: `op "flow" refused: the open flow task ${open.id} "${open.title}" cannot be read as a flow state; the owner must remove that task before #${issue} can move.`,
    };
  if (to == null)
    return {
      error: `op "flow" refused: "to" is required once #${issue} is in the flow; it is at ${DISPLAY_NAMES[current.at] ?? current.at}. Allowed: ${allowedMoves(current).join(", ") || "none"}.`,
    };
  return move(current, to);
}

/**
 * The FLOW task of one issue, driven by the flow machine (flow-machine.js): the caller
 * names the issue and the move (`to`); the machine decides, and the task stores the
 * FlowState with `title(state)` as its title. One open per canonical issue (found by
 * `flow.issue`, or by the `#N ·` prefix of a title-only task, which is upgraded on this
 * first touch). Only `to:"done"` from proof closes it. owner:"agent" so a closed one is
 * pruned like any done agent task; while open, every other closer and generic
 * update/remove skips or refuses it (isOpenFlow guards). A refusal returns the same
 * `list` (not written), except a budget refusal, whose forced waiting state is saved.
 * @param {Task[]} list @param {{ title?: string, note?: string, status?: string, _by?: string, issue?: string | number, to?: string }} op @param {string} now
 * @returns {{ list: Task[], error?: string, info?: string }} */
function setFlow(list, op, now) {
  if (op.title != null || op.status != null)
    return {
      list,
      error: `op "flow" refused: it takes no "title" or "status" — the tool keeps the step and counters. Send ${FLOW_CALL}.`,
    };
  const issue = canonicalIssue(op.issue);
  if (!issue)
    return {
      list,
      error: `op "flow" refused: issue "${op.issue}" is not a number. Send ${FLOW_CALL}.`,
    };
  const open = list.find((t) => isOpenFlow(t) && flowIssueOf(t) === issue);
  const res = open ? moveOpen(open, issue, op.to) : start(issue, op.to);
  if (!res.state) return { list, error: res.error };
  const state = res.state;
  const fields = {
    flow: state,
    title: flowTitle(state),
    ...(op.note != null ? { note: String(op.note).slice(0, 500) } : {}),
    ...(res.done ? { status: /** @type {Task["status"]} */ ("done") } : {}),
  };
  const info = flowLine(state, !open && !!state.placed, !!res.done);
  if (open)
    return {
      list: list.map((t) => (t.id === open.id ? { ...t, ...fields } : t)),
      error: res.error,
      info,
    };
  const task = makeTask(list, { owner: "agent", status: "in_progress", agent: op._by }, now);
  return { list: [...list, { ...task, ...fields, kind: "flow" }], info };
}

/** The one open objective, if the session has one. @param {Task[]} list @returns {Task | undefined} */
export const openObjective = (list) =>
  list.find((t) => t.kind === "objective" && t.status !== "done");

/**
 * The human's OBJECTIVE for the session — the standing answer to "what are we here to do".
 * Nothing else in the framework carried it across turns (framework-audit
 * D6-objective-not-durable: each turn re-derived its goal from the freshest receipt, and
 * "close these issues" drifted into three new PRs). It is a task because the board already
 * persists across sessions, is re-read every turn, and is echoed in every tool result —
 * `summarize` prints it FIRST, so the aim re-enters context on every board call without a
 * new subsystem. At most one open: setting again REPLACES the title (same id); `status:"done"`
 * closes it — that close is the session's closure, not the last receipt. owner:"user" keeps it
 * clear of the pruner and every agent task-closer; only the human or the orchestrator ends it.
 * @param {Task[]} list @param {{ title?: string, note?: string, status?: string, _by?: string }} op @param {string} now
 * @returns {Task[]} */
function setObjective(list, op, now) {
  const open = openObjective(list);
  if (op.status === "done") {
    return open ? list.map((t) => (t.id === open.id ? { ...t, status: "done" } : t)) : list;
  }
  const title = op.title != null ? String(op.title).slice(0, 200) : open?.title;
  if (!title) return list;
  const note = op.note != null ? String(op.note).slice(0, 500) : open?.note;
  if (open)
    return list.map((t) => (t.id === open.id ? { ...t, title, ...(note ? { note } : {}) } : t));
  return [
    ...list,
    makeTask(
      list,
      { title, note, owner: "user", status: "in_progress", agent: op._by, kind: "objective" },
      now,
    ),
  ];
}

/** Drop agent-owned `done` tasks at a turn boundary so the board reflects live
 * work instead of a graveyard of completed items. Keeps open tasks and every
 * user-owned to-do (those are the user's to clear) — except a CLOSED objective, which
 * is the session's finished aim, not a to-do. Returns the new list, or
 * null when nothing was pruned (so the caller can skip a redundant broadcast).
 * @returns {Task[] | null} */
export function pruneDoneTasks() {
  const list = readTasks();
  const kept = list.filter(
    (t) => t.status !== "done" || (t.owner !== "agent" && t.kind !== "objective"),
  );
  if (kept.length === list.length) return null;
  writeTasks(kept);
  return kept;
}

/** Add one in_progress agent task bridging a backgrounded worker onto the board;
 * returns the new list plus the created id (so the caller can settle it later).
 * Tagged `agent: "background"` so the straggler sweep never touches a live worker.
 * @param {string} title @param {string | undefined} note @param {string} now
 * @returns {{ list: Task[], id: string }} */
export function addBackgroundTask(title, note, now) {
  const list = readTasks();
  const task = makeTask(
    list,
    { title, note, status: "in_progress", owner: "agent", agent: "background" },
    now,
  );
  list.push(task);
  writeTasks(list);
  return { list, id: task.id };
}

/** Normalize a question title for idempotent matching: trim, lowercase, collapse
 * internal whitespace. The single source of truth for "same question" used by both
 * the addQuestion dedup and the inline-ask block (session.js canUseTool).
 * @param {string} s @returns {string} */
export function normalizeQ(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Find an already-open (`status !== "done"`) async question whose title matches
 * `title` (normalized). Returns the existing task, or undefined. Lets a second
 * channel coalesce onto the first instead of opening a divergent record.
 * @param {string} title @returns {Task | undefined} */
export function findOpenQuestion(title) {
  const want = normalizeQ(title);
  return readTasks().find(
    (t) => t.kind === "question" && t.status !== "done" && normalizeQ(t.title) === want,
  );
}

/** File an async question onto the board (see mcp__ui__ask / ask-tool.js) as an
 * `owner:"user"` item the user answers inline. owner:"user" keeps it clear of the
 * pruner and the sub-agent task-closers, so it survives until the user answers and
 * the orchestrator relays it — exactly the durability a fire-and-forget worker's
 * question needs. Idempotent: a re-spawned/looping worker filing the same question
 * coalesces onto the open one (refreshing its options) rather than stacking a
 * duplicate (the addPromotion pattern). @param {string} question
 * @param {string[] | undefined} options @param {string | undefined} agent
 * @param {string} now @returns {Task[]} */
export function addQuestion(question, options, agent, now) {
  const list = readTasks();
  const open = list.find(
    (t) =>
      t.kind === "question" && t.status !== "done" && normalizeQ(t.title) === normalizeQ(question),
  );
  if (open) {
    // Duplicate of a still-open question: refresh options, don't stack a second record.
    if (Array.isArray(options) && options.length) {
      open.options = options.map((o) => String(o).slice(0, 120)).slice(0, 8);
    }
    writeTasks(list);
    return list;
  }
  list.push(
    makeTask(
      list,
      { title: question, options, owner: "user", status: "pending", agent, kind: "question" },
      now,
    ),
  );
  writeTasks(list);
  return list;
}

/** Mark `done` every open (not-done) `owner:"agent"` task, optionally scoped to
 * one creating agent. The deterministic close: callers pass the finishing agent's
 * label so only its tasks close (see closeOpenByAgent / the `complete_open` op).
 * With no `agent`, closes ALL open agent tasks (blunt fallback). Always returns
 * the new list so the caller can broadcast + summarize.
 * @param {string} [agent] @returns {Task[]} */
export function closeOpenAgentTasks(agent) {
  // An open flow task is closed only by op "flow" (setFlow), never by a run's close-out.
  const list = readTasks().map((t) =>
    t.owner === "agent" &&
    t.status !== "done" &&
    t.kind !== "flow" &&
    (agent == null || t.agent === agent)
      ? { ...t, status: /** @type {Task["status"]} */ ("done") }
      : t,
  );
  writeTasks(list);
  return list;
}

/** Close a specific agent's open tasks (its scratchpad) — called when that
 * sub-agent finishes (task_notification). Same-label workers running in parallel
 * would close each other's tasks, but the orchestrator forbids backgrounding two
 * workers on the same files and foreground runs serially, so collisions don't
 * arise in practice. @param {string} agent @returns {Task[]} */
export function closeOpenByAgent(agent) {
  return closeOpenAgentTasks(agent);
}

/** Turn-end backstop: mark `done` any open `owner:"agent"` task left by a
 * sub-agent that is no longer running — i.e. a foreground straggler whose
 * task_notification never arrived (hard interrupt/abort). Skips the orchestrator's
 * own board (`agent: "main"`), live background workers (`agent: "background"`),
 * and any sub-agent still listed in `running`. Returns the new list, or null when
 * nothing changed (so the caller can skip a redundant broadcast).
 *
 * "background"-labeled tasks need the extra flag: the subagent-ui-control hook bypasses
 * canUseTool for EVERY sub-agent (foreground included), so its tasks arrive without the
 * `_by` stamp and get attributed to "background" — a hard exclusion here left those stuck
 * in_progress forever. They are swept exactly when NO background worker is live.
 * @param {Set<string>} running labels of sub-agents still in flight
 * @param {boolean} [anyBackgroundLive] a background worker is still in flight (default
 *   true = conservative: keep "background" tasks unless the caller knows none live)
 * @returns {Task[] | null} */
export function closeStragglerTasks(running, anyBackgroundLive = true) {
  const list = readTasks();
  let changed = false;
  const next = list.map((t) => {
    if (
      t.owner !== "agent" ||
      t.status === "done" ||
      t.kind === "flow" ||
      t.agent == null ||
      t.agent === "main"
    )
      return t;
    const straggler = t.agent === "background" ? !anyBackgroundLive : !running.has(t.agent);
    if (!straggler) return t;
    changed = true;
    return { ...t, status: /** @type {Task["status"]} */ ("done") };
  });
  if (!changed) return null;
  writeTasks(next);
  return next;
}

/** One-line summary for the tool result. Always names the still-open tasks so the
 * agent can tell at a glance whether its work is closed (not just a count).
 * @param {Task[]} list @returns {string} */
export function summarize(list) {
  // The objective leads every result — the aim re-enters context on every board call.
  const aim = openObjective(list);
  const head = aim ? `OBJECTIVE: ${aim.title}\n` : "";
  const rest = aim ? list.filter((t) => t.id !== aim.id) : list;
  const open = rest.filter((t) => t.status !== "done");
  const done = rest.length - open.length;
  const base = `${rest.length} task${rest.length === 1 ? "" : "s"} (${done} done).`;
  if (!open.length) return head + (rest.length ? `${base} All closed.` : base);
  const items = open.map((t) => `${t.id} ${t.title} [${t.status}]`).join(", ");
  return `${head}${base} OPEN: ${items}`;
}
