// The flow task of one issue, as pure list code: it takes a task list and returns the new
// one, and never touches disk. tasks-store.js persists what it returns. It must not import
// ui/server/core/config.js (directly or through another import): a hook process with no
// server config loads it.
import {
  DISPLAY_NAMES,
  DONE,
  FIX_LIMIT,
  OWNER_STOPS,
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

export const OWNERS = new Set(["agent", "user"]);
export const STATUSES = new Set(["pending", "in_progress", "done"]);

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
export function makeTask(list, spec, now) {
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

/** An open flow task — the durable state of one issue in the flow (see setFlow).
 * @param {Task | undefined} t @returns {boolean} */
export const isOpenFlow = (t) => t?.kind === "flow" && t.status !== "done";

/** `#84 · Design · …` → "84": how a title-only flow task (written before FlowState) is found. */
export const FLOW_TITLE = /^#(\d+)\s*·/;
/** The canonical issue of a flow task: its FlowState, else its `#N ·` title prefix.
 * @param {Task} t @returns {string | undefined} */
export const flowIssueOf = (t) => t.flow?.issue ?? canonicalIssue(FLOW_TITLE.exec(t.title)?.[1]);
export const FLOW_CALL = '{op:"flow", issue:84, to:"design"}';

/** The status line of op "flow": where the issue is now and the ids it may move to.
 * @param {FlowState} s @param {boolean} placed @param {boolean} done @returns {string} */
export function flowLine(s, placed, done) {
  if (done) return `#${s.issue} is Done; its flow task is closed.`;
  const name = DISPLAY_NAMES[s.at] ?? s.at;
  const from = s.from ? ` (from ${DISPLAY_NAMES[s.from] ?? s.from})` : "";
  const where = placed ? `placed at ${name}` : `is at ${name}${from}`;
  return `#${s.issue} ${where} (triage ${s.triage}/${TRIAGE_LIMIT}, fix ${s.fix}/${FIX_LIMIT}). Allowed next: ${allowedMoves(s).join(", ") || "none"}.`;
}

/**
 * May a question go to the owner about `issue` now? Only at an OWNER_STOPS state. No
 * issue, no open flow task, or a flow task that cannot be read → it passes.
 * @param {Task[]} list @param {string | number | null | undefined} issue
 * @returns {{ ok: true } | { ok: false, message: string, at?: string }} */
export function questionGate(list, issue) {
  if (issue == null || String(issue).trim() === "") return { ok: true };
  const key = canonicalIssue(issue);
  if (!key)
    return {
      ok: false,
      message: `question refused: issue "${issue}" is not a number. Send the issue as a number, e.g. 84.`,
    };
  const open = list.find((t) => isOpenFlow(t) && flowIssueOf(t) === key);
  const state = open && (open.flow ?? fromLegacyTitle(open.title));
  const at = state?.at;
  if (!state || !at || OWNER_STOPS.includes(at)) return { ok: true };
  const allowed = allowedMoves(state);
  // Done is no active flow; and a refusal never goes out with an empty way out.
  if (at === DONE || !allowed.length) return { ok: true };
  const stops = OWNER_STOPS.map((id) => DISPLAY_NAMES[id] ?? id).join("; ");
  // The way out names only moves the machine accepts from the current state.
  const wayOut = allowed.includes("waiting-owner")
    ? `move the issue to waiting-owner with the tasks tool ` +
      `({op:"flow", issue:${key}, to:"waiting-owner"}), name the one missing thing, then ask. `
    : `the flow does not allow waiting-owner from here; it allows only: ${allowed.join(", ")}. ` +
      `Move to that step first with the tasks tool ` +
      `(${allowed.map((to) => `{op:"flow", issue:${key}, to:"${to}"}`).join(" or ")}); ` +
      `from there waiting-owner is reachable. Then move to waiting-owner, name the one missing thing, then ask. `;
  return {
    ok: false,
    at,
    message:
      `question refused: #${key} is at ${DISPLAY_NAMES[at] ?? at}, which is not an owner stop. ` +
      `The owner stops are: ${stops}. Work inside the confirmed Design is done without asking. ` +
      `Work that cannot go on: ${wayOut}` +
      `Write in your report what you did instead of asking.`,
  };
}

/** The move asked of an open flow task, or why there is none (title-only task upgraded first).
 * @param {Task} open @param {string} issue @param {string | undefined} to
 * @returns {{ state?: FlowState, error?: string, done?: boolean }} */
export function moveOpen(open, issue, to) {
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
export function setFlow(list, op, now) {
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
