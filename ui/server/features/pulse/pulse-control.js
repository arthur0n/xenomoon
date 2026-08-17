// Pulse's scheduler — ONE timer per server process, not one per websocket.
//
// Why a singleton: handleConnection() builds a fresh inbox per browser connection, so a
// per-connection timer would mean two tabs both computing the same delta and both injecting the
// same beat. All connections live in this one process (the port is pinned per project in
// .xenomoon.json), so a module-level timer plus "deliver to the most recently active session" is
// the whole fix — no lockfile, no lease. Two SERVER PROCESSES on one project would still race;
// the port binding prevents that, and it is the known boundary rather than a solved case.
//
// Deliberately NOT built on makeCheckLoop: that function reads readAutonomous(), writes
// recordCheck() and sends `autonomousMode` — it is Autonomous Mode, not a reusable timer. The two
// mechanics worth copying are here instead: skip the tick when the session is busy (never stack
// turns) and unref the timer (never block process exit).
import { readAutonomous } from "../autonomous/autonomous-store.js";
import { runChecks } from "./pulse-checks.js";
import {
  readPulse,
  recordBeat,
  pruneSeen,
  sleepPulse,
  wakePulse,
  publicPulse,
  FLAT_BEATS_TO_SLEEP,
} from "./pulse-store.js";

/** @typedef {import("@anthropic-ai/claude-agent-sdk").SDKUserMessage} SDKUserMessage */
/** @typedef {import("../../../lib/types.js").OutMsg} OutMsg */
/** @typedef {import("../../../lib/types.js").PulseItem} PulseItem */
/** @typedef {{ id: number, push: (m: SDKUserMessage) => void, send: (o: OutMsg) => void, isBusy: () => boolean, lastActive: number }} PulseSession */

/** Live sessions, newest activity wins delivery. @type {Map<number, PulseSession>} */
const sessions = new Map();
/** @type {ReturnType<typeof setInterval> | null} */
let timer = null;
let nextId = 1;
let beating = false; // a beat is async — never let a second one overlap it

/** The session a beat is delivered to: the most recently active one. @returns {PulseSession | null} */
function target() {
  let best = null;
  for (const s of sessions.values()) if (!best || s.lastActive > best.lastActive) best = s;
  return best;
}

/** Broadcast the Pulse view to every connected client (the LED is per-browser, not per-session).
 * @param {import("../../../lib/types.js").Pulse} state */
function broadcast(state) {
  const view = publicPulse(state);
  for (const s of sessions.values()) s.send({ type: "pulse", payload: view });
}

/** The synthetic turn a found beat injects. Facts only — the doctrine lives in the spine, so we
 * don't pay for it on every beat. @param {number} n @param {PulseItem[]} items @returns {SDKUserMessage} */
function beatTurn(n, items) {
  const lines = items.map((i) => `· ${i.title} → ${i.action}`).join("\n");
  return {
    type: "user",
    parent_tool_use_id: null,
    message: {
      role: "user",
      content: [
        {
          type: "text",
          text:
            `[pulse · beat ${n}] changed since last beat:\n${lines}\n\n` +
            "Reconcile only (spine: Pulse). Land what is routine, file an ask-task for anything " +
            "needing the human, then stop. No code, no refactor, no new slices.",
        },
      ],
    },
  };
}

/** One beat. Runs the checks, keeps only NEW or CHANGED items, injects a turn if there are any.
 * Never throws — a failed beat records its error and the loop keeps its rhythm. */
async function beat() {
  if (beating) return;
  const state = readPulse();
  if (!state.active || state.sleeping) return;
  // Autonomous owns the session while it runs; a second injector would double-drive the Hive.
  if (readAutonomous().active) return;
  const to = target();
  if (!to || to.isBusy()) return; // no one to tell, or a turn is already in flight

  beating = true;
  try {
    const now = new Date().toISOString();
    const { items, error, degraded } = await runChecks(state.scope);
    // Delta: fire on a new id, or on an id whose action-deciding fingerprint changed.
    const fired = items.filter((i) => state.seen[i.id] !== i.fp);
    const suppressed = items.length - fired.length;

    // A DEGRADED sweep (a check could not run) must never be folded into the delta memory or the
    // sleep counter. Pruning on a blind sweep would wipe `seen` and re-report everything once the
    // eye returns, and counting it as flat would nap on a broken sensor — the failure that shipped:
    // five "clean" beats that had checked nothing at all.
    if (!degraded) pruneSeen(items.map((i) => i.id));
    const next = recordBeat({ fired, suppressed, now, error, flat: !degraded });

    if (fired.length) {
      const live = target(); // re-resolve: the async checks may have outlived the old target
      if (live && !live.isBusy()) live.push(beatTurn(next.beats, fired));
    }
    broadcast(!degraded && next.flatBeats >= FLAT_BEATS_TO_SLEEP ? sleepPulse(now) : next);
  } catch (err) {
    const state2 = recordBeat({
      fired: [],
      suppressed: 0,
      now: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    });
    broadcast(state2);
  } finally {
    beating = false;
  }
}

/** Start/stop the singleton timer to match persisted state. Safe to call repeatedly. */
export function syncTimer() {
  const state = readPulse();
  const wanted = state.active && !state.sleeping && sessions.size > 0;
  if (!wanted) {
    if (timer) clearInterval(timer);
    timer = null;
    return;
  }
  if (timer) return; // already ticking at the right cadence
  timer = setInterval(() => void beat(), state.intervalMs);
  timer.unref?.(); // never hold the process open
}

/** Register a live session as a possible delivery target.
 * @param {Omit<PulseSession, "id" | "lastActive">} s @returns {number} handle for unregister */
export function registerSession(s) {
  const id = nextId++;
  sessions.set(id, { ...s, id, lastActive: Date.now() });
  s.send({ type: "pulse", payload: publicPulse(readPulse()) });
  syncTimer();
  return id;
}

/** @param {number} id */
export function unregisterSession(id) {
  sessions.delete(id);
  syncTimer();
}

/** Any human message: this session becomes the delivery target, and a sleeping Pulse wakes
 * silently — the human never has to remember to switch it back on. @param {number} id */
export function noteHumanActivity(id) {
  const s = sessions.get(id);
  if (s) s.lastActive = Date.now();
  const state = readPulse();
  if (state.active && state.sleeping) broadcast(wakePulse(new Date().toISOString()));
  syncTimer();
}

/** Fire a beat now (arming, or mcp__ui__pulse op:"now"). */
export async function beatNow() {
  await beat();
}

/** Re-broadcast current state to every client (after arm/disarm from a control message). */
export function publish() {
  broadcast(readPulse());
  syncTimer();
}
