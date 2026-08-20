// The rule for letting a new npm version into the lockfile.
//
// Pins are the defence: `npm ci` installs the lockfile exactly, so a package compromised
// tonight cannot reach anyone until a human regenerates the lock. That protection is worth
// nothing if the regeneration is reflexive — "audit says fix, so fix" walks a fresh
// attacker-published version straight in, which is precisely how the npm supply-chain
// incidents land. A malicious release is typically caught and unpublished within days.
//
// So a candidate version must AGE before it is eligible: too young → hold, no matter what
// the advisory says. Old enough → it is eligible, and then the advisories decide.
//
// Deliberately pure: the clock and the registry are arguments, so the rule is testable
// without a network or a wall clock.

/** Days a version must exist before we will pin it. */
export const MIN_AGE_DAYS = 7;

/** @typedef {"hold" | "ready" | "unknown"} Verdict */
/** @typedef {{ name: string, version: string, publishedAt?: string | null }} Candidate */
/** @typedef {{ name: string, version: string, verdict: Verdict, ageDays: number | null,
 *              reason: string }} Judgement */

/** How old `publishedAt` is at `now`, in days — null when the registry had no date for it.
 * @param {string | null | undefined} publishedAt @param {Date} now @returns {number | null} */
export function ageDays(publishedAt, now) {
  if (!publishedAt) return null;
  const at = new Date(publishedAt).getTime();
  if (Number.isNaN(at)) return null;
  return (now.getTime() - at) / 86_400_000;
}

/** Whether one candidate version may enter the lockfile.
 * @param {Candidate} candidate @param {Date} now @param {number} [minAgeDays]
 * @returns {Judgement} */
export function judge(candidate, now, minAgeDays = MIN_AGE_DAYS) {
  const age = ageDays(candidate.publishedAt, now);
  const base = { name: candidate.name, version: candidate.version, ageDays: age };
  // No date is NOT permission. An unreachable registry, an unpublished version and a
  // tampered response all look the same from here, and each is a reason to wait.
  if (age === null)
    return { ...base, verdict: "unknown", reason: "no publish date from the registry" };
  if (age < minAgeDays)
    return {
      ...base,
      verdict: "hold",
      reason: `published ${age.toFixed(1)}d ago — under the ${minAgeDays}d quarantine`,
    };
  return { ...base, verdict: "ready", reason: `published ${age.toFixed(1)}d ago` };
}

/** Judge a whole set of candidates, held first — the ones a human must decide about.
 * @param {Candidate[]} candidates @param {Date} now @param {number} [minAgeDays]
 * @returns {Judgement[]} */
export function judgeAll(candidates, now, minAgeDays = MIN_AGE_DAYS) {
  const order = { hold: 0, unknown: 1, ready: 2 };
  return candidates
    .map((c) => judge(c, now, minAgeDays))
    .sort((a, b) => order[a.verdict] - order[b.verdict] || a.name.localeCompare(b.name));
}

/** The npm command that applies only the eligible half — empty when nothing is eligible.
 * A bump is per-package on purpose: `npm audit fix` takes every candidate including the
 * quarantined ones, which is the exact behaviour this policy exists to prevent.
 * @param {Judgement[]} judged @returns {string} */
export function bumpCommand(judged) {
  const ready = judged.filter((j) => j.verdict === "ready").map((j) => j.name);
  return ready.length > 0 ? `npm update ${ready.join(" ")} --package-lock-only` : "";
}
