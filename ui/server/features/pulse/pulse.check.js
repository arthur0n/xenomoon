// Pulse's two load-bearing guardrails, checked deterministically. Both are the difference between
// a useful safety net and a nagger, and neither is observable by reading the code:
//   1. DELTA — an unchanged item must never fire twice.
//   2. FLAT -> SLEEP -> WAKE — it must go quiet on its own and come back on a human turn.
// Bare-node, no deps (mirrors skills.check.js / reducer.check.js). Runs against a temp PROJECT_DIR
// so it never touches the real .xenomoon/pulse.json.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// config.js resolves PROJECT_DIR at import time, and GAME_DIR is the env override it honours
// (an upstream-era name). Point it at a scratch dir BEFORE importing the store so this check is
// hermetic and never touches the real .xenomoon/pulse.json.
const scratch = mkdtempSync(path.join(tmpdir(), "pulse-check-"));
process.env.GAME_DIR = scratch;

const {
  readPulse,
  armPulse,
  recordBeat,
  sleepPulse,
  wakePulse,
  publicPulse,
  pruneSeen,
  FLAT_BEATS_TO_SLEEP,
} = await import("./pulse-store.js");

let failures = 0;
/** @param {boolean} cond @param {string} what */
function check(cond, what) {
  if (cond) console.log(`ok  ${what}`);
  else {
    console.error(`✗   ${what}`);
    failures++;
  }
}

const iso = () => new Date().toISOString();
/** @param {string} id @param {string} fp @returns {import("../../../lib/types.js").PulseItem} */
const item = (id, fp) => ({ id, fp, action: "act", title: id });

// --- 1. delta: same id + same fingerprint must not fire twice -------------------------------
armPulse(iso());
const first = [item("branch:x:unpushed", "ahead-2"), item("pr:9:idle", "MERGEABLE/green")];
recordBeat({ fired: first, suppressed: 0, now: iso() });

const seen = readPulse().seen;
const unchanged = first.filter((i) => seen[i.id] !== i.fp);
check(unchanged.length === 0, "delta: an unchanged item is suppressed on the next beat");

// A CHANGED fingerprint on the same id is genuinely news and must fire again.
const changed = [item("branch:x:unpushed", "ahead-5")];
const fires = changed.filter((i) => readPulse().seen[i.id] !== i.fp);
check(fires.length === 1, "delta: a changed fingerprint re-fires (same id, new state)");

// --- 2. flat beats -> sleep, human turn -> wake ----------------------------------------------
for (let i = 0; i < FLAT_BEATS_TO_SLEEP; i++) recordBeat({ fired: [], suppressed: 2, now: iso() });
check(
  readPulse().flatBeats >= FLAT_BEATS_TO_SLEEP,
  `flat beats accumulate to the sleep threshold (${FLAT_BEATS_TO_SLEEP})`,
);
sleepPulse(iso());
check(readPulse().sleeping === true, "sleep: goes quiet after enough flat beats");
check(readPulse().active === true, "sleep: stays ARMED (sleeping is not off)");
wakePulse(iso());
const woke = readPulse();
check(
  woke.sleeping === false && woke.flatBeats === 0,
  "wake: a human turn re-arms and resets flat",
);

// A found beat must reset the flat counter, or Pulse would sleep mid-conversation.
recordBeat({ fired: [item("pr:10:idle", "a")], suppressed: 0, now: iso() });
check(readPulse().flatBeats === 0, "a found beat resets the flat-beat counter");

// --- 3. a BLIND sweep must never look like a clean one ---------------------------------------
// The bug this exists to prevent: sh() collapsed "ran, found nothing" and "could not run" into
// null, so a sweep whose checks all failed recorded found:0 / error:null — identical to a healthy
// repo — and Pulse reported five calm beats while checking nothing.
const beforeFlat = readPulse().flatBeats;
recordBeat({ fired: [], suppressed: 0, now: iso(), error: "git not found on PATH", flat: false });
const degraded = readPulse();
check(degraded.lastError !== null, "degraded: a failed check surfaces in lastError");
check(
  degraded.flatBeats === beforeFlat,
  "degraded: a blind beat does NOT count toward sleep (never nap on a broken sensor)",
);

// And the real gatherer must report WHY, not just an empty list. PATH is emptied so every binary
// resolution fails — the exact live failure mode.
const realPath = process.env.PATH;
process.env.PATH = "/nonexistent";
const { runChecks } = await import("./pulse-checks.js");
const blind = await runChecks("project");
process.env.PATH = realPath;
check(blind.degraded === true, "runChecks reports degraded when a binary cannot be resolved");
check(
  typeof blind.error === "string" && blind.error.length > 0,
  `runChecks populates the error channel (got: ${blind.error ?? "null"})`,
);

// --- 3b. Codex review follow-ups -------------------------------------------------------------
// A broken `gh` (missing binary) must DEGRADE, not become a quiet note — otherwise Pulse sleeps
// with its GitHub eyes shut, which is the original bug with one note in front of it.
process.env.PATH = "/nonexistent";
const blindGh = await runChecks("project");
process.env.PATH = realPath;
check(
  blindGh.degraded && /not found on PATH/.test(blindGh.error ?? ""),
  "a missing binary degrades the sweep rather than emitting a suppressible note",
);
check(
  !blindGh.items.some((i) => i.id === "env:gh-unauthenticated"),
  "broken gh does NOT masquerade as merely unauthenticated",
);

// runChecks is exported and non-re-entrant internally; it must serialize itself.
const [a, b] = await Promise.all([runChecks("project"), runChecks("project")]);
check(
  typeof a.degraded === "boolean" && typeof b.degraded === "boolean",
  "concurrent runChecks calls serialize instead of corrupting each other's failure list",
);

// --- 4. hygiene ------------------------------------------------------------------------------
pruneSeen(["pr:10:idle"]);
check(
  Object.keys(readPulse().seen).every((id) => id === "pr:10:idle"),
  "pruneSeen forgets ids that no longer exist (a resolved item may legitimately fire again)",
);
check(
  !Object.prototype.hasOwnProperty.call(publicPulse(readPulse()), "seen"),
  "publicPulse never ships the delta map to the browser",
);

rmSync(scratch, { recursive: true, force: true });
if (failures) {
  console.error(`✗ pulse: ${failures} check(s) failed`);
  process.exit(1);
}
console.log("ok  pulse: delta suppression + sleep/wake behave");
