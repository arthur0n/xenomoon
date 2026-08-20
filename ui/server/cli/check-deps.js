#!/usr/bin/env node
// Dependency report — what the lockfile is exposed to, and which fixes are eligible yet.
//
// A REPORT, never a gate. Someone else can publish an advisory at any hour; if that turned
// `npm run validate` red, the gate would be teaching people to bypass it within a week. This
// runs in the framework-audit preflight (weekly, human-run) and prints what to decide.
//
// Usage: node ui/server/cli/check-deps.js [--json]
import { execFileSync } from "node:child_process";
import { parseJSON } from "../../lib/json.js";
import { judgeAll, bumpCommand, MIN_AGE_DAYS } from "./deps-policy.js";

/** @param {string[]} args @returns {string} */
function npm(args) {
  return execFileSync("npm", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Run npm, returning its output even when it exits non-zero (`audit` does, on findings).
 * @param {string[]} args @returns {string} */
function npmOutput(args) {
  try {
    return npm(args);
  } catch (err) {
    const out = /** @type {{ stdout?: Buffer | string }} */ (err).stdout;
    return typeof out === "string" ? out : (out?.toString("utf8") ?? "");
  }
}

/** Severity per vulnerable package, as npm sees the CURRENT lockfile.
 * @returns {Record<string, string>} */
function advisorySeverities() {
  const raw = npmOutput(["audit", "--json", "--package-lock-only"]);
  if (!raw.trim()) return {};
  const parsed = /** @type {{ vulnerabilities?: Record<string, { severity?: string }> }} */ (
    parseJSON(raw)
  );
  return Object.fromEntries(
    Object.entries(parsed.vulnerabilities ?? {}).map(([n, v]) => [n, v.severity ?? "unknown"]),
  );
}

/** Every version a fix would bring INTO the tree.
 *
 * Read from the fix PLAN, not from `fixAvailable` — npm reports that as a bare `true` with no
 * version, and it names only the vulnerable package. The plan names both, and it also names
 * the packages a bump would ADD, which is where the fresh-version risk actually hides: one
 * aged, blameless bump can pull in a two-day-old transitive dependency.
 * @returns {{ name: string, version: string, from?: string, added: boolean }[]} */
function plannedVersions() {
  // No `--package-lock-only` here: it makes npm report "up to date" and print no plan at
  // all. `--dry-run` is what keeps this read-only.
  const raw = npmOutput(["audit", "fix", "--dry-run"]);
  /** @type {{ name: string, version: string, from?: string, added: boolean }[]} */
  const out = [];
  for (const line of raw.split("\n")) {
    const m = /^(add|change)\s+(\S+)\s+(?:(\S+)\s+=>\s+)?(\S+)\s*$/.exec(line.trim());
    if (!m) continue;
    const [, verb, name, from, version] = m;
    if (!name || !version) continue;
    out.push({ name, version, from, added: verb === "add" });
  }
  return out;
}

/** When the registry says a version was published — null when it will not say.
 * @param {string} name @param {string} version @returns {string | null} */
function publishedAt(name, version) {
  try {
    const times = /** @type {Record<string, string>} */ (
      parseJSON(npm(["view", name, "time", "--json"]))
    );
    return times[version] ?? null;
  } catch {
    return null;
  }
}

const severities = advisorySeverities();
const vulnerable = Object.keys(severities);

if (vulnerable.length === 0) {
  console.log("ok  deps: no advisories against the pinned tree.");
  process.exit(0);
}

const planned = plannedVersions();
const judged = judgeAll(
  planned.map((p) => ({ ...p, publishedAt: publishedAt(p.name, p.version) })),
  new Date(),
);
/** @param {string} name */
const judgementFor = (name) => judged.find((j) => j.name === name);

console.log(
  `deps: ${vulnerable.length} advisor${vulnerable.length === 1 ? "y" : "ies"} against the lockfile.`,
);
for (const name of vulnerable) {
  const j = judgementFor(name);
  const target = j ? `→ ${j.version} · ${j.verdict} (${j.reason})` : "→ no fix published yet";
  console.log(`  ${(severities[name] ?? "?").padEnd(8)} ${name.padEnd(22)} ${target}`);
}

// A blameless bump can drag a brand-new package in behind it — the version nobody inspects,
// because nothing was reported against it. Only the ones failing quarantine are worth
// printing; aged collateral is noise.
const collateral = judged.filter((j) => !vulnerable.includes(j.name) && j.verdict !== "ready");
if (collateral.length > 0) {
  console.log("\n  a fix would also pull IN:");
  for (const j of collateral) console.log(`    ${j.name}@${j.version} — ${j.reason}`);
}

const held = judged.filter((j) => j.verdict !== "ready");
const cmd = bumpCommand(judged.filter((j) => vulnerable.includes(j.name)));
console.log(
  cmd
    ? `\n  Past the ${MIN_AGE_DAYS}d quarantine:\n    ${cmd}\n` +
        (held.length > 0
          ? `  But the plan still contains held versions, and npm does not say which bump\n` +
            `  brings which. Run it, then re-run this check: anything held that appears in the\n` +
            `  tree afterwards came in behind that bump, and the lockfile should be reverted.`
          : `  Then re-run this check and commit the lockfile.`)
    : `\n  Nothing eligible — every candidate is inside the ${MIN_AGE_DAYS}d quarantine or undated.`,
);
console.log(
  "  Never `npm audit fix`: it applies every candidate, quarantined ones included, which is\n" +
    "  the behaviour this check exists to prevent.",
);
// Always 0: this reports, it does not gate.
process.exit(0);
