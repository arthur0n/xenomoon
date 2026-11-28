/**
 * The flow of one issue as a pure state machine: twelve steps, five waiting states and
 * DONE (plugin/docs/flow/README.md). No file access and no store: the caller keeps the
 * FlowState and asks this module where it may go next. Every move comes from FLOW_TABLE;
 * a refused move returns `{ error }` that names where the issue is and what is allowed.
 */

/** @typedef {import("../../../lib/types.js").FlowState} FlowState */
/** @typedef {"triage" | "fix"} Counter */
/** @typedef {string | { to: string, count?: Counter, redesign?: boolean }} Edge */
/** @typedef {{ to: string, count?: Counter, redesign?: boolean }} Move */
/** @typedef {{ state?: FlowState, error?: string, done?: boolean }} MoveResult */

export const STEP_IDS = Object.freeze([
  "screening",
  "direction",
  "triage",
  "contract",
  "design",
  "plan",
  "build",
  "review",
  "fix",
  "commit",
  "publish",
  "proof",
]);
export const WAITING_IDS = Object.freeze([
  "needs-information",
  "waiting-owner",
  "ready-not-published",
  "waiting-proof",
  "proof-failed",
]);
export const DONE = "done";
export const FLOW_IDS = Object.freeze([...STEP_IDS, ...WAITING_IDS, DONE]);
/** The only states where a question to the owner is allowed (README.md, "The owner stops, and nothing else"). */
export const OWNER_STOPS = Object.freeze([
  "direction",
  "design",
  "needs-information",
  "waiting-owner",
  "ready-not-published",
  "proof-failed",
]);

/** @type {Readonly<Record<string, string>>} */
export const DISPLAY_NAMES = Object.freeze({
  screening: "Screening",
  direction: "Direction",
  triage: "Triage",
  contract: "Contract",
  design: "Design",
  plan: "Plan",
  build: "Build",
  review: "Review",
  fix: "Fix",
  commit: "Commit",
  publish: "Publish",
  proof: "Proof",
  "needs-information": "Needs information",
  "waiting-owner": "Waiting for the owner",
  "ready-not-published": "Ready, not published",
  "waiting-proof": "Waiting for the proof",
  "proof-failed": "Proof failed",
  done: "Done",
});

/** Visits to Triage per issue (direction.md:10). */
export const TRIAGE_LIMIT = 2;
/** Fix rounds per issue (fix.md:7). */
export const FIX_LIMIT = 3;
/** @type {Readonly<Record<Counter, number>>} */
export const LIMITS = Object.freeze({ triage: TRIAGE_LIMIT, fix: FIX_LIMIT });
/** Where a counted move over its limit leaves the issue. @type {Readonly<Record<Counter, string>>} */
const FORCED = Object.freeze({ triage: "needs-information", fix: "waiting-owner" });

/** The row entry "go back to the step or state recorded in `from`". */
const RETURN = "<from>";
const W = "waiting-owner";

/**
 * Every allowed move. A string is a plain move; `count` raises that counter (refused
 * over its limit); `redesign` is fix → design, allowed only at round FIX_LIMIT and once.
 * RETURN goes back to `from`; from waiting-owner, RETURN_EXTRA[from] is also open.
 * @type {Readonly<Record<string, ReadonlyArray<Edge>>>}
 */
export const FLOW_TABLE = Object.freeze({
  screening: ["direction", "needs-information", W],
  direction: [{ to: "triage", count: "triage" }, "contract", "needs-information", W],
  triage: ["direction", W],
  contract: ["design", W],
  design: ["plan", W],
  plan: ["build", W],
  build: ["review", W],
  review: [{ to: "fix", count: "fix" }, "commit", W],
  fix: [{ to: "fix", count: "fix" }, "commit", { to: "design", redesign: true }, W],
  commit: ["publish", { to: "fix", count: "fix" }, W],
  publish: ["waiting-proof", "ready-not-published", W],
  proof: [DONE, "proof-failed", "waiting-proof", W],
  "needs-information": [RETURN],
  "waiting-owner": [RETURN],
  "ready-not-published": ["publish"],
  "waiting-proof": ["proof"],
  "proof-failed": [{ to: "fix", count: "fix" }, W],
  done: [],
});

/** From waiting-owner, the plain moves open besides the return to `from` (build.md:13:
 * the work no longer fits the Design, so on the owner's word it goes back to Design). */
const RETURN_EXTRA = Object.freeze(
  /** @type {Record<string, readonly string[]>} */ ({ build: Object.freeze(["design"]) }),
);

/** Entering one of these records `from`; leaving any state clears it. */
const HOLDS_FROM = new Set(["needs-information", "waiting-owner"]);

/** @param {string} id */
const nameOf = (id) => DISPLAY_NAMES[id] ?? id;

/** "08" → "8"; anything but digits → undefined. @param {string | number | undefined} issue */
export function canonicalIssue(issue) {
  const s = String(issue ?? "").trim();
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, "") : undefined;
}

/** @param {FlowState} state */
const canRedesign = (state) => state.fix === FIX_LIMIT && !state.redesigned;

/** What can enter waiting-owner / needs-information per FLOW_TABLE: the only valid `from`. */
const ORIGINS = new Set([...STEP_IDS, "proof-failed"]);

/** The moves open from `state` right now. @param {FlowState} state @returns {Move[]} */
function movesOf(state) {
  return (FLOW_TABLE[state.at] ?? []).flatMap((e) => {
    if (e !== RETURN) return [typeof e === "string" ? { to: e } : e];
    // A state read from a hand-written title (fromLegacyTitle) has no `from`: the origin
    // was never recorded, so any step is accepted as the return target, once. An origin
    // that could never enter a waiting state (e.g. "done") counts as not recorded.
    if (!state.from || !ORIGINS.has(state.from)) return STEP_IDS.map((to) => ({ to }));
    const extra = state.at === W ? (RETURN_EXTRA[state.from] ?? []) : [];
    return [state.from, ...extra].map((to) => ({ to }));
  });
}

/** The ids `move(state, …)` accepts now (a counted move may still hit its budget).
 * @param {FlowState} state @returns {string[]} */
export function allowedMoves(state) {
  const ids = movesOf(state)
    .filter((m) => !m.redesign || canRedesign(state))
    .map((m) => m.to);
  return [...new Set(ids)];
}

/** @param {FlowState} state */
function where(state) {
  const from = state.from ? ` (from ${nameOf(state.from)})` : "";
  return `${nameOf(state.at)}${from}`;
}

/** @param {FlowState} state @param {string} to @returns {MoveResult} */
function refuse(state, to) {
  const allowed = allowedMoves(state);
  const why =
    to === "design" && state.at === "fix"
      ? ` Fix → design is allowed only in round ${FIX_LIMIT}/${FIX_LIMIT} and only once.`
      : "";
  return {
    error: `move to "${to}" refused: #${state.issue} is at ${where(state)}.${why} Allowed: ${allowed.join(", ") || "none"}.`,
  };
}

/** @param {FlowState} state @param {Counter} counter @returns {MoveResult} */
function overBudget(state, counter) {
  const forced = { ...state, at: FORCED[counter], from: state.at };
  return {
    state: forced,
    error: `move refused: the ${counter} budget is used (${state[counter]}/${LIMITS[counter]}). #${state.issue} now waits in ${where(forced)}.`,
  };
}

/** @param {FlowState} state @param {Move} m @returns {FlowState} */
function enter(state, m) {
  const next = { ...state, at: m.to };
  delete next.from;
  if (m.count) next[m.count] = state[m.count] + 1;
  if (m.redesign) next.redesigned = true;
  if (HOLDS_FROM.has(m.to)) next.from = state.at;
  return next;
}

/**
 * One move of the flow. Table move → `{ state }` (`done: true` too when it reaches DONE).
 * Refused → `{ error }`; over a budget → `{ error, state }` with the forced waiting state.
 * @param {FlowState} state @param {string} to @returns {MoveResult}
 */
export function move(state, to) {
  if (!FLOW_IDS.includes(to))
    return { error: `move to "${to}" refused: unknown id. Valid ids: ${FLOW_IDS.join(", ")}.` };
  const m = movesOf(state).find((x) => x.to === to && (!x.redesign || canRedesign(state)));
  // Only Proof closes an issue, however the target was reached (README.md: "Only Proof").
  if (!m || (to === DONE && state.at !== "proof")) return refuse(state, to);
  if (m.count && state[m.count] >= LIMITS[m.count]) return overBudget(state, m.count);
  const next = enter(state, m);
  return to === DONE ? { state: next, done: true } : { state: next };
}

/**
 * A new flow. No `to` (or "screening") → Screening; another step → that step with
 * `placed` (an issue worked before the flow). A waiting state or DONE is refused.
 * @param {string | number} issue @param {string} [to] @returns {MoveResult}
 */
export function start(issue, to = "screening") {
  const key = canonicalIssue(issue);
  if (!key) return { error: `start refused: issue "${issue}" is not a number.` };
  if (!STEP_IDS.includes(to))
    return {
      error: `start refused: "${to}" is not a step. An issue starts at one of: ${STEP_IDS.join(", ")}.`,
    };
  /** @type {FlowState} */
  const state = { issue: key, at: to, triage: 0, fix: 0 };
  if (to !== "screening") state.placed = to;
  // Placed in a counted step: being there is the first visit / the first round.
  if (to === "triage" || to === "fix") state[to] = 1;
  return { state };
}

/** `#84 · Design · triage 1/2 · fix 0/3[ · placed at Review]`. @param {FlowState} state */
export function title(state) {
  const parts = [
    `#${state.issue}`,
    where(state),
    `triage ${state.triage}/${TRIAGE_LIMIT}`,
    `fix ${state.fix}/${FIX_LIMIT}`,
  ];
  if (state.placed) parts.push(`placed at ${nameOf(state.placed)}`);
  return parts.join(" · ");
}

const BY_NAME = new Map(Object.entries(DISPLAY_NAMES).map(([id, n]) => [n.toLowerCase(), id]));
/** @param {string | undefined} n */
const idByName = (n) =>
  BY_NAME.get(
    String(n ?? "")
      .trim()
      .toLowerCase(),
  );

/** @param {string[]} parts @param {RegExp} re */
const readPart = (parts, re) => parts.map((p) => re.exec(p)?.[1]).find((v) => v != null);

/** A hand-written counter: missing, negative or not a whole number → 0; over its limit →
 * the limit. @param {string[]} parts @param {Counter} c */
function readCount(parts, c) {
  const n = Number(readPart(parts, new RegExp(`^${c}\\s+(\\S+?)\\s*\\/`, "i")));
  return Number.isInteger(n) && n > 0 ? Math.min(n, LIMITS[c]) : 0;
}

/** `from` only when the state holds one and the origin could really enter it.
 * @param {string} at @param {string | undefined} name */
function legacyFrom(at, name) {
  const id = idByName(name);
  return HOLDS_FROM.has(at) && id && ORIGINS.has(id) ? id : undefined;
}

/**
 * Reads a title-only flow task written by hand before FlowState existed, e.g.
 * `#84 · Design · triage 1/2 · fix 0/3 · agents 5`. Unknown parts (agents n) are
 * ignored; missing counters read 0. No `#N ·` or an unknown step name → null.
 * @param {string} text @returns {FlowState | null}
 */
export function fromLegacyTitle(text) {
  const [head = "", place = "", ...rest] = String(text ?? "")
    .trim()
    .split(/\s*·\s*/);
  const issue = canonicalIssue(/^#(\d+)$/.exec(head)?.[1]);
  const m = /^(.*?)(?:\s*\(from\s+(.+)\))?$/i.exec(place);
  const at = idByName(m?.[1]);
  if (!issue || !at) return null;
  /** @type {FlowState} */
  const state = { issue, at, triage: readCount(rest, "triage"), fix: readCount(rest, "fix") };
  const from = legacyFrom(at, m?.[2]);
  if (from) state.from = from;
  const placed = idByName(readPart(rest, /^placed at\s+(.+)$/i));
  if (placed) state.placed = placed;
  return state;
}
