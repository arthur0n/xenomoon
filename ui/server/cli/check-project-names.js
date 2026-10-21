#!/usr/bin/env node
// Gate: no project this machine drives may be named in framework SOURCE.
//
// The existing contamination gate reads the capability trees (skills, library) with
// prose-shaped signals, and derives its terms from the ONE bound project. Neither half covered
// how a real leak actually happened: a project name typed into a test under `ui/server/`, on a
// trunk that binds no project — so the term list was empty AND the tree was unscanned, and
// validate went green.
//
// This is the narrow complement: whole-word matches of known project names, across tracked
// source. It scans `git ls-files`, so install output and node_modules are out of scope by
// construction rather than by an exclude list that will drift.
//
// Terms: the install registry + bound project (known-projects.js) AND the local denylist
// (denylist.js) — client names that never get an install.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";
import { knownProjectTerms, readInstallsMap } from "./known-projects.js";
import { loadDenylist, findTerms } from "./denylist.js";

const FRAMEWORK_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TREES = ["ui", "plugin", "domains", "scripts"];
/** Text files worth reading. Anything else cannot leak a name a human typed. */
const TEXT = /\.(js|mjs|cjs|ts|tsx|jsx|json|md|sh|bash|yml|yaml|css|html|txt)$/i;

/** The bound project's dir, if this install has one. @returns {string} */
function boundProjectDir() {
  try {
    const f = path.join(FRAMEWORK_DIR, ".xenomoon.json");
    if (!existsSync(f)) return "";
    const cfg = /** @type {{ projectDir?: unknown }} */ (parseJSON(readFileSync(f, "utf8")));
    return typeof cfg.projectDir === "string" ? cfg.projectDir : "";
  } catch {
    return "";
  }
}

/** @type {string[]} */
let denylisted;
try {
  denylisted = loadDenylist().terms;
} catch (e) {
  console.error(`✗ project-names: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
const terms = [
  ...new Set([
    ...knownProjectTerms({ installs: readInstallsMap(), boundProjectDir: boundProjectDir() }),
    ...denylisted,
  ]),
].sort();

if (terms.length === 0) {
  // No registry and nothing bound — CI, or a fresh machine. Nothing to look for, and saying so
  // is the point: a gate that cannot see must not report as if it did.
  console.log(
    "ok  project-names: no known projects and no denylist on this machine — nothing to check against.",
  );
  process.exit(0);
}

/** Tracked files under the framework trees. @returns {string[]} */
function trackedFiles() {
  try {
    return execFileSync("git", ["ls-files", "--", ...TREES], {
      cwd: FRAMEWORK_DIR,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
      .split("\n")
      .filter((f) => f && TEXT.test(f));
  } catch {
    return [];
  }
}

/** @type {import("./denylist.js").TermHit[]} */
const hits = [];
for (const rel of trackedFiles()) {
  /** @type {string} */
  let text;
  try {
    text = readFileSync(path.join(FRAMEWORK_DIR, rel), "utf8");
  } catch {
    continue; // unreadable file — not evidence of anything
  }
  hits.push(...findTerms(text, rel, terms));
}

if (hits.length > 0) {
  console.error(
    `✗ project-names: ${hits.length} reference(s) to a known project or denylisted name:`,
  );
  for (const h of hits) console.error(`    ${h.file}:${h.line} — "${h.term}"\n      ${h.text}`);
  console.error(
    "  The framework ships to every project. Use a neutral name (alpha/beta) in examples and\n" +
      "  tests; a project's own facts belong in that project's repo.",
  );
  process.exit(1);
}
console.log(
  `ok  project-names: framework source names none of ${terms.length} known project/denylisted term(s).`,
);
