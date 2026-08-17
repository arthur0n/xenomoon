// Pulse state — the ambient landing sweep's persisted memory, next to the project like
// autonomous-store.js. Two things live here: the ON/SLEEPING flags (so an armed Pulse survives a
// reconnect) and `seen`, the id -> fingerprint map that makes a beat fire on CHANGE rather than on
// existence. Without that map Pulse would re-report the same unpushed branch every 10 minutes,
// which is the nagger we are explicitly not building.
//
// Pure disk module: no per-connection state, re-read/written on each mutation. Writes go through a
// temp file + rename so a beat interrupted mid-write can never leave a half-JSON that reads as
// "nothing seen" and re-injects everything.
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../../lib/json.js";
import { PROJECT_DIR } from "../../core/config.js";

/** @typedef {import("../../../lib/types.js").Pulse} Pulse */
/** @typedef {import("../../../lib/types.js").PulseItem} PulseItem */

/** Default cadence. Long enough that a found beat is rare, short enough to catch work before the
 * human does. */
export const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
/** Consecutive flat beats before Pulse sleeps (6 x 10 min ~ 1h). Sleeping is NOT off: the next
 * human message re-arms it silently, so nobody has to remember to switch it back on. */
export const FLAT_BEATS_TO_SLEEP = 6;

/** @returns {string} */
const dir = () => path.join(PROJECT_DIR, ".xenomoon");
/** @returns {string} */
const filePath = () => path.join(dir(), "pulse.json");

/** The OFF state. @returns {Pulse} */
function blank() {
  return {
    active: false,
    sleeping: false,
    intervalMs: DEFAULT_INTERVAL_MS,
    scope: "both",
    startedAt: null,
    lastBeatAt: null,
    nextBeatAt: null,
    beats: 0,
    flatBeats: 0,
    found: 0,
    suppressed: 0,
    lastError: null,
    seen: {},
  };
}

/** Read persisted state; absent or corrupt reads as OFF. @returns {Pulse} */
export function readPulse() {
  try {
    const parsed = parseJSON(readFileSync(filePath(), "utf8"));
    if (!parsed || typeof parsed !== "object") return blank();
    const state = { ...blank(), .../** @type {Pulse} */ (parsed) };
    // A corrupt/legacy `seen` must degrade to "remember nothing", never crash the beat.
    if (!state.seen || typeof state.seen !== "object") state.seen = {};
    return state;
  } catch {
    return blank();
  }
}

/** Atomic write: temp file + rename, so an interrupted beat can't truncate the delta memory.
 * @param {Pulse} state @returns {Pulse} */
function write(state) {
  mkdirSync(dir(), { recursive: true });
  const tmp = `${filePath()}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  renameSync(tmp, filePath());
  return state;
}

/** The browser view — everything except the delta map, which is server-only bookkeeping and
 * would bloat every broadcast. @param {Pulse} state @returns {Omit<Pulse, "seen">} */
export function publicPulse(state) {
  const { seen: _seen, ...view } = state;
  return view;
}

/** Arm Pulse. Clears the delta memory deliberately: the first beat after arming SHOULD report
 * what is currently unlanded — that is the "landing sweep opens the session" behaviour.
 * @param {string} now ISO @param {number} [intervalMs] @returns {Pulse} */
export function armPulse(now, intervalMs = DEFAULT_INTERVAL_MS) {
  const prev = readPulse();
  return write({
    ...blank(),
    scope: prev.scope,
    active: true,
    sleeping: false,
    intervalMs,
    startedAt: now,
    nextBeatAt: new Date(Date.parse(now) + intervalMs).toISOString(),
  });
}

/** Disarm (the human switched it off). Keeps `seen` so re-arming later doesn't re-report
 * everything it already surfaced. @param {string} now @returns {Pulse} */
export function disarmPulse(now) {
  const prev = readPulse();
  return write({ ...prev, active: false, sleeping: false, lastBeatAt: now, nextBeatAt: null });
}

/** Sleep after too many flat beats. Stays `active` — sleeping is a quiet state, not off, so the
 * LED still shows Pulse is watching. @param {string} now @returns {Pulse} */
export function sleepPulse(now) {
  const prev = readPulse();
  return write({ ...prev, sleeping: true, lastBeatAt: now, nextBeatAt: null });
}

/** Re-arm after sleep — called on ANY human message, silently. No-op unless actually asleep.
 * @param {string} now @returns {Pulse} */
export function wakePulse(now) {
  const prev = readPulse();
  if (!prev.active || !prev.sleeping) return prev;
  return write({
    ...prev,
    sleeping: false,
    flatBeats: 0,
    nextBeatAt: new Date(Date.parse(now) + prev.intervalMs).toISOString(),
  });
}

/** Record one beat's outcome and fold the fired items into the delta memory.
 *
 * `flat: false` marks a DEGRADED beat — one where a check could not run. Such a beat must not
 * count toward sleep (Pulse would nap on a blind sweep) and its empty result must not be trusted
 * as "clean". Default true keeps ordinary beats behaving normally.
 * @param {{ fired: PulseItem[], suppressed: number, now: string, error?: string | null, flat?: boolean }} r
 * @returns {Pulse} */
export function recordBeat({ fired, suppressed, now, error = null, flat: countable = true }) {
  const prev = readPulse();
  const seen = { ...prev.seen };
  for (const item of fired) seen[item.id] = item.fp;
  const flat = !countable ? prev.flatBeats : fired.length === 0 ? prev.flatBeats + 1 : 0;
  return write({
    ...prev,
    seen,
    beats: prev.beats + 1,
    flatBeats: flat,
    found: fired.length,
    suppressed,
    lastBeatAt: now,
    nextBeatAt: new Date(Date.parse(now) + prev.intervalMs).toISOString(),
    lastError: error,
  });
}

/** Forget ids that no longer exist, so a resolved item can legitimately fire again later (a
 * branch pushed then re-diverged is genuinely news). @param {string[]} liveIds @returns {Pulse} */
export function pruneSeen(liveIds) {
  const prev = readPulse();
  const live = new Set(liveIds);
  /** @type {Record<string, string>} */
  const seen = {};
  for (const [id, fp] of Object.entries(prev.seen)) if (live.has(id)) seen[id] = fp;
  return Object.keys(seen).length === Object.keys(prev.seen).length
    ? prev
    : write({ ...prev, seen });
}

/** Persist the watch scope (settings). @param {Pulse["scope"]} scope @returns {Pulse} */
export function setScope(scope) {
  return write({ ...readPulse(), scope });
}
