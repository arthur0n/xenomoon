// Pulse's deterministic eyes: read-only checks that answer "what finished but never landed?".
//
// Two rules make this safe to run on a timer, and both are the opposite of how the rest of the
// codebase shells out:
//   1. ASYNC, never execFileSync. epic-tool.js:26 uses the sync form because a human triggered it;
//      on a 10-minute timer a sync `gh` that hangs on an auth refresh blocks the Node event loop —
//      websockets, permission replies and task updates all stall behind it.
//   2. TIMEOUT + output cap on every call. `gh` can hang on network, rate limits or a keychain
//      prompt; a check that never returns would wedge every later beat.
//
// `gh` is OPTIONAL. No origin remote, no auth, or no gh binary degrades to the git-only checks plus
// ONE note — never a per-beat complaint about the same missing tool.
//
// Each check returns PulseItems carrying a STABLE id and a fingerprint (`fp`) of only the fields
// that decide the action, so pulse-control can fire on change instead of on existence.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECT_DIR } from "../../core/config.js";

/** @typedef {import("../../../lib/types.js").PulseItem} PulseItem */

const run = promisify(execFile);
const FRAMEWORK_DIR = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);

const TIMEOUT_MS = 10_000; // a check that can't answer in 10s is not worth a beat
const MAX_BUFFER = 1 << 20; // 1 MB — a repo with thousands of refs must not blow the heap
const MAX_ITEMS_PER_CHECK = 20; // cap the noise a pathological repo can produce

/** Parse a `gh --json` array. A malformed or non-array payload is a FAULT, not an empty repo:
 * "the command succeeded but its output contract broke" is exactly the kind of silent success
 * this whole file exists to stop. Degrades the sweep instead of reporting zero PRs.
 * @param {string} out @param {string} what @returns {unknown[]} */
function parseList(out, what) {
  try {
    const raw = /** @type {unknown} */ (JSON.parse(out));
    if (Array.isArray(raw)) return /** @type {unknown[]} */ (raw);
    failures.push(`${what} returned JSON that is not an array`);
    return [];
  } catch {
    failures.push(`${what} returned unparseable JSON`);
    return [];
  }
}

/** Failures this beat, newest last. Reset per sweep — a check that could not RUN is recorded
 * here so a blind sweep can never be reported as a clean one. @type {string[]} */
let failures = [];
/** Serialization queue: runChecks() chains onto this so two sweeps never share `failures`. */
let inFlight = /** @type {Promise<void>} */ (Promise.resolve());

/** One read-only command. Never throws.
 *
 * Returns a DISCRIMINATED result, not a bare string-or-null: the original version collapsed
 * "ran, found nothing" and "could not run at all" into the same `null`, so every caller read a
 * missing binary as "nothing to report" and a totally blind sweep rendered as a calm flat beat.
 * That shipped, and it silently blinded Pulse for five beats — `gh` lives in /opt/homebrew/bin and
 * a server started outside the user's shell has no such PATH. A safety net that cannot tell
 * "clean" from "broken" is worse than no net, because it reports success either way.
 * @param {string} bin @param {string[]} args @param {string} cwd
 * @returns {Promise<{ ok: true, out: string } | { ok: false, why: string }>} */
async function sh(bin, args, cwd) {
  try {
    const { stdout } = await run(bin, args, {
      cwd,
      encoding: "utf8",
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });
    return { ok: true, out: stdout };
  } catch (err) {
    const e = /** @type {{ code?: string, killed?: boolean }} */ (err);
    // ENOENT = the binary isn't on this process's PATH (the live failure). killed = our timeout.
    const why =
      e.code === "ENOENT"
        ? `${bin} not found on PATH`
        : e.killed
          ? `${bin} ${args[0] ?? ""} timed out after ${TIMEOUT_MS / 1000}s`
          : `${bin} ${args[0] ?? ""} failed (${e.code ?? "non-zero exit"})`;
    return { ok: false, why };
  }
}

/** Run a command, recording a REAL failure (missing binary / timeout / crash) so it surfaces.
 * Returns null only when the command genuinely could not run. @param {string} bin
 * @param {string[]} args @param {string} cwd @returns {Promise<string | null>} */
async function shLoud(bin, args, cwd) {
  const r = await sh(bin, args, cwd);
  if (r.ok) return r.out;
  failures.push(r.why);
  return null;
}

/** Run a command whose failure is EXPECTED and meaningful (a probe: "is there an origin?",
 * "is gh authenticated?"). Silent — a false answer here is information, not a fault.
 * @param {string} bin @param {string[]} args @param {string} cwd @returns {Promise<string | null>} */
async function shProbe(bin, args, cwd) {
  const r = await sh(bin, args, cwd);
  return r.ok ? r.out : null;
}

/** No origin is a legitimate ANSWER (a local-only repo), so this stays a silent probe.
 * @param {string} cwd @returns {Promise<boolean>} */
const hasOrigin = async (cwd) =>
  (await shProbe("git", ["remote", "get-url", "origin"], cwd)) !== null;

/** Is `gh` usable? Distinguishes the two cases the first fix wrongly merged:
 *   "unauthenticated"  → an ANSWER. gh works, you are logged out; a note, not a fault.
 *   "not found"/timeout → a FAULT. PR + issue checks are blind, and if that is not degraded
 *                         Pulse sleeps confident while half its eyes are shut — the original
 *                         bug with one note in front of it (Codex's top finding).
 * @param {string} cwd @returns {Promise<"ready" | "unauthenticated" | "broken">} */
async function ghState(cwd) {
  const r = await sh("gh", ["auth", "status"], cwd);
  if (r.ok) return "ready";
  // A non-zero exit from a gh that RAN is the logged-out answer; anything else is a fault.
  if (/not found on PATH|timed out/.test(r.why)) {
    failures.push(r.why);
    return "broken";
  }
  return "unauthenticated";
}

/** Confirm a branch is REALLY ahead of the remote, not just ahead of a stale tracking ref.
 *
 * `%(upstream:track)` compares against the last FETCHED state, so a branch published from another
 * checkout (or by a teammate) reads as "N commits unpushed" until someone fetches. Caught by
 * dogfooding: this repo's `main` reported 3 unpushed commits that were already on GitHub, because
 * it is published from a sibling trunk checkout. A recurring false alarm is worse than silence —
 * it teaches you to ignore the light.
 *
 * One `ls-remote` per SUSPICIOUS branch (zero when nothing looks ahead) confirms it against the
 * real remote. If the remote sha isn't in the local object DB we can't count precisely, so we say
 * so rather than inventing a number.
 * @param {string} cwd @param {string} branch @param {string} aheadGuess
 * @returns {Promise<{ ahead: string, verified: boolean } | null>} null = not actually ahead */
async function confirmAhead(cwd, branch, aheadGuess) {
  const ls = await shLoud("git", ["ls-remote", "--heads", "origin", branch], cwd);
  if (ls === null) return { ahead: aheadGuess, verified: false }; // offline — report, flagged
  const remoteSha = ls.split(/\s+/)[0];
  if (!remoteSha) return { ahead: aheadGuess, verified: false }; // genuinely absent upstream
  const localSha = (await shLoud("git", ["rev-parse", branch], cwd))?.trim();
  if (remoteSha === localSha) return null; // stale tracking ref — already published
  const count = (
    await shLoud("git", ["rev-list", "--count", `${remoteSha}..${branch}`], cwd)
  )?.trim();
  if (count === "0") return null;
  return count ? { ahead: count, verified: true } : { ahead: aheadGuess, verified: false };
}

/** Local branches with commits the remote doesn't have — the "finished but never pushed" case.
 * One porcelain call lists them; only the suspicious ones cost a network round trip.
 * @param {string} cwd @param {string} scopeTag @returns {Promise<PulseItem[]>} */
async function unpushedBranches(cwd, scopeTag) {
  const out = await shLoud(
    "git",
    [
      "for-each-ref",
      "--format=%(refname:short)\t%(upstream:short)\t%(upstream:track)",
      "refs/heads",
    ],
    cwd,
  );
  if (out === null) return [];
  /** @type {PulseItem[]} */
  const items = [];
  for (const line of out.split("\n").filter(Boolean)) {
    const found = await branchItem(cwd, line, scopeTag);
    if (found) items.push(found);
    if (items.length >= MAX_ITEMS_PER_CHECK) break;
  }
  return items;
}

/** One `for-each-ref` line -> an item, or null when the branch is fully landed.
 * @param {string} cwd @param {string} line @param {string} scopeTag
 * @returns {Promise<PulseItem | null>} */
async function branchItem(cwd, line, scopeTag) {
  const [branch = "", upstream = "", track = ""] = line.split("\t");
  if (branch === "HEAD") return null;
  const aheadGuess = /ahead (\d+)/.exec(track)?.[1];
  // No upstream at all is also unlanded work — a branch that exists only on this machine.
  const orphan = !upstream;
  if (!aheadGuess && !orphan) return null;

  if (!aheadGuess)
    return {
      id: `${scopeTag}branch:${branch}:unpushed`,
      fp: "no-upstream",
      action: "act",
      title: `${branch} — never pushed (no upstream)`,
    };

  const confirmed = await confirmAhead(cwd, branch, aheadGuess);
  if (!confirmed) return null; // already published; the tracking ref was just stale
  const { ahead, verified } = confirmed;
  return {
    id: `${scopeTag}branch:${branch}:unpushed`,
    // Verification state belongs IN the fingerprint. Without it, a branch reported offline as
    // "ahead-2 (unconfirmed)" and later confirmed as "ahead-2" carries the same fp, so the
    // upgrade from guess to fact is silently suppressed and you never learn it was real.
    fp: `ahead-${ahead}${verified ? "" : "/unverified"}`,
    action: "act",
    title: `${branch} — ${ahead} commit(s) unpushed${verified ? "" : " (unconfirmed — remote unreachable)"}`,
  };
}

/** Worktrees other than the main checkout — where "finished" work hides most effectively.
 * @param {string} cwd @param {string} scopeTag @returns {Promise<PulseItem[]>} */
async function strayWorktrees(cwd, scopeTag) {
  const out = await shLoud("git", ["worktree", "list", "--porcelain"], cwd);
  if (out === null) return [];
  /** @type {PulseItem[]} */
  const items = [];
  const blocks = out.split("\n\n").filter(Boolean);
  for (const block of blocks.slice(1)) {
    // slice(1): the first block is the main checkout
    const dir = /^worktree (.+)$/m.exec(block)?.[1];
    if (!dir) continue;
    items.push({
      id: `${scopeTag}worktree:${dir}`,
      fp: /^branch (.+)$/m.exec(block)?.[1] ?? "detached",
      action: "note",
      title: `stray worktree — ${dir}`,
    });
    if (items.length >= MAX_ITEMS_PER_CHECK) break;
  }
  return items;
}

/** Open PRs: mergeable+green ones are landable now; failing/conflicted ones are stuck. Both are
 * "not landed", with different actions. @param {string} cwd @returns {Promise<PulseItem[]>} */
async function openPRs(cwd) {
  const out = await shLoud(
    "gh",
    [
      "pr",
      "list",
      "--state",
      "open",
      "--limit",
      "30",
      "--json",
      "number,title,mergeable,statusCheckRollup,isDraft,updatedAt",
    ],
    cwd,
  );
  if (out === null) return [];
  const prs =
    /** @type {Array<{number:number,title:string,mergeable:string,isDraft:boolean,statusCheckRollup?:Array<{conclusion?:string}>}>} */ (
      parseList(out, "gh pr list")
    );
  /** @type {PulseItem[]} */
  const items = [];
  for (const pr of prs.slice(0, MAX_ITEMS_PER_CHECK)) {
    if (pr.isDraft) continue;
    const checks = pr.statusCheckRollup ?? [];
    const failing = checks.some((c) => c.conclusion === "FAILURE" || c.conclusion === "TIMED_OUT");
    const blocked = failing || pr.mergeable === "CONFLICTING";
    items.push({
      id: `pr:${pr.number}:${blocked ? "blocked" : "idle"}`,
      // Deliberately coarse: the PR's landability, not its updatedAt — timestamps would churn the
      // fingerprint on every unrelated comment and re-fire the beat.
      fp: `${pr.mergeable}/${failing ? "failing" : "green"}`,
      action: blocked ? "ask" : "act",
      title: blocked
        ? `#${pr.number} ${pr.title} — ${failing ? "checks failing" : "conflicting"}`
        : `#${pr.number} ${pr.title} — mergeable, checks green`,
    });
  }
  return items;
}

/** Open issues whose fix is already merged — the "shipped but the tracker doesn't know" case, and
 * open issues explicitly waiting on the human. @param {string} cwd @returns {Promise<PulseItem[]>} */
async function stalledIssues(cwd) {
  const out = await shLoud(
    "gh",
    ["issue", "list", "--state", "open", "--limit", "40", "--json", "number,title,labels"],
    cwd,
  );
  if (out === null) return [];
  const issues = /** @type {Array<{number:number,title:string,labels?:Array<{name:string}>}>} */ (
    parseList(out, "gh issue list")
  );
  /** @type {PulseItem[]} */
  const items = [];
  for (const issue of issues.slice(0, MAX_ITEMS_PER_CHECK)) {
    const labels = (issue.labels ?? []).map((l) => l.name);
    // The case that started this feature: open, and the tracker is telling you it needs YOU.
    const waiting = labels.some((l) => /needs-input|question|blocked|awaiting/i.test(l));
    if (!waiting) continue;
    items.push({
      id: `issue:${issue.number}:awaiting-human`,
      fp: labels.sort().join(","),
      action: "ask",
      title: `#${issue.number} ${issue.title} — waiting on you (${labels.join(", ")})`,
    });
  }
  return items;
}

/** Run every check for the configured scope. Returns items plus a soft error string — a degraded
 * environment (no gh/auth/origin) is reported ONCE via `note`, not as a failure.
 * @param {"project" | "forge" | "both"} scope
 * @returns {Promise<{ items: PulseItem[], error: string | null, degraded: boolean }>} */
export async function runChecks(scope) {
  // `failures` is module-level (every check pushes into it without threading an accumulator
  // through eight signatures), which makes this function NON-RE-ENTRANT: two overlapping sweeps
  // would reset each other's list and report the wrong faults. beat() already serializes the
  // timer/tool/arm paths with its own guard, but runChecks is EXPORTED — so it serializes itself
  // here rather than trusting every future caller to know that.
  const mine = inFlight.then(() => sweep(scope));
  inFlight = mine.then(
    () => undefined,
    () => undefined,
  );
  return mine;
}

/** One sweep. Only ever entered via runChecks()'s queue. @param {"project" | "forge" | "both"} scope
 * @returns {Promise<{ items: PulseItem[], error: string | null, degraded: boolean }>} */
async function sweep(scope) {
  /** @type {PulseItem[]} */
  const items = [];
  failures = []; // per-sweep; a stale failure must never be reported against a later beat

  if (scope === "project" || scope === "both") {
    const cwd = PROJECT_DIR;
    items.push(...(await unpushedBranches(cwd, "")), ...(await strayWorktrees(cwd, "")));
    if (await hasOrigin(cwd)) {
      const gh = await ghState(cwd);
      if (gh === "ready") items.push(...(await openPRs(cwd)), ...(await stalledIssues(cwd)));
      else if (gh === "unauthenticated")
        // An ANSWER, not a fault: gh works, you are logged out. A note, suppressed after the
        // first beat — and NOT degraded, so Pulse may still sleep on a clean local repo.
        items.push({
          id: "env:gh-unauthenticated",
          fp: "no-auth",
          action: "note",
          title: "gh not authenticated — PR/issue checks are off (`gh auth login`)",
        });
      // gh === "broken" already pushed a failure in ghState(), so the sweep is degraded and the
      // LED says so. It must NOT also emit a note: the note would be suppressed as unchanged
      // after beat 1, and Pulse would go quiet with half its eyes shut.
    }
  }

  // The forge itself: this session's own lesson — framework commits sat unpushed for hours and
  // only the human noticed.
  if (scope === "forge" || scope === "both") {
    if (FRAMEWORK_DIR !== PROJECT_DIR)
      items.push(...(await unpushedBranches(FRAMEWORK_DIR, "forge:")));
  }

  // The error channel this function always promised and never populated: without it a sweep where
  // EVERY command failed returned `{ items: [], error: null }` — byte-identical to a clean repo.
  // Dedupe so one missing binary across seven checks reads as one problem, not seven.
  const unique = [...new Set(failures)];
  const error = unique.length ? unique.join(" · ") : null;
  return { items, error, degraded: unique.length > 0 };
}
