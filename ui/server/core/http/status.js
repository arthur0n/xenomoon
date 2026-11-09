// Per-server status snapshot (#60): one small, disk-free JSON answer to "what is this install
// doing right now?" — idle / working / waiting on the human — built from the live session registry.
// The env part (name/path/domain/port/pid) is resolved ONCE at module load, so a polled request
// never touches disk.
import { PROJECT_DIR, DOMAIN, PORT } from "../config.js";
import { liveSessions } from "../registry.js";
import { projectName } from "./project-state.js";

/** @typedef {import("../connection.js").LiveSession} LiveSession */
/** @typedef {import("../connection.js").PendingEntry} PendingEntry */
/** The fields of a LiveSession the status reads (a real LiveSession fits).
 * @typedef {Pick<LiveSession, "pending" | "busy" | "lastLine" | "runningAgents" | "activitySeq">} StatusSession */
/** @typedef {{ name: string, path: string, domain: string, port: number, pid: number }} StatusEnv */
/** @typedef {"idle" | "working" | "waiting"} StatusState */
/** @typedef {StatusEnv & { state: StatusState, sessions: number, lastLine: string, at: string }} StatusPayload */

/** @param {unknown} v @returns {string} */
const str = (v) => (typeof v === "string" ? v : "");

/** The human-readable text of a pending card's wire message (`{ type, id, ...payload }`, built in
 * connection.js makeWaitFor). Shapes: ask → `input.questions[].question` (session-permissions.js:42,
 * the SDK AskUserQuestion input); form → `input.title` (form-tool.js:46,69); permission →
 * `reason` when a gate gave one (ui-control.js:446), else `toolName` (session-permissions.js:93,
 * ui-control.js:84). Falls back to the message type.
 * @param {PendingEntry["msg"]} msg @returns {string} */
export function pendingText(msg) {
  const m = /** @type {Record<string, unknown>} */ (msg);
  const input = /** @type {Record<string, unknown>} */ (m.input ?? {});
  const questions = /** @type {unknown[]} */ (
    Array.isArray(input.questions) ? input.questions : []
  );
  const question = str(/** @type {{ question?: unknown } | undefined} */ (questions[0])?.question);
  return question || str(input.title) || str(m.reason) || str(m.toolName) || str(m.type);
}

/** Highest activitySeq wins. @param {StatusSession[]} list @returns {StatusSession | undefined} */
function mostRecent(list) {
  return list.reduce(
    (best, s) => (!best || s.activitySeq > best.activitySeq ? s : best),
    /** @type {StatusSession | undefined} */ (undefined),
  );
}

/** Pure status snapshot. `waiting` (any pending card of any type) beats `working` (busy turn or a
 * running sub-agent) beats `idle`. @param {StatusSession[]} sessions @param {number} now
 * @param {StatusEnv} env @returns {StatusPayload} */
export function statusPayload(sessions, now, env) {
  const waiting = sessions.filter((s) => s.pending.size > 0);
  const working = sessions.some((s) => s.busy.value || s.runningAgents > 0);
  /** @type {StatusState} */
  const state = waiting.length ? "waiting" : working ? "working" : "idle";
  // The newest card (Map keeps insertion order) of the most recently active waiting session.
  const card = [...(mostRecent(waiting)?.pending.values() ?? [])].at(-1);
  const lastLine = card ? pendingText(card.msg) : (mostRecent(sessions)?.lastLine ?? "");
  const { name, path, domain, port, pid } = env;
  return {
    name,
    path,
    domain,
    port,
    pid,
    state,
    sessions: sessions.length,
    lastLine,
    at: new Date(now).toISOString(),
  };
}

/** @type {StatusEnv} */
const ENV = Object.freeze({
  name: projectName(),
  path: PROJECT_DIR,
  domain: DOMAIN.name,
  port: PORT,
  pid: process.pid,
});

/** The install's static identity, resolved once at module load. @returns {StatusEnv} */
export function statusEnv() {
  return ENV;
}

/** The live snapshot for the route. @param {number} [now] @returns {StatusPayload} */
export function currentStatus(now = Date.now()) {
  return statusPayload(liveSessions(), now, statusEnv());
}
