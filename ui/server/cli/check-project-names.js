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
//
// Modes (one scanner, three surfaces):
//   (default)        tracked source under ui/ plugin/ domains/ scripts/   — npm run validate
//   --staged         added lines + paths of the staged changes, any file  — .husky/pre-commit
//   --push           added lines of every commit being pushed; reads the  — .husky/pre-push
//                    hook's stdin (`<local ref> <local sha> <remote ref> <remote sha>` lines)
//   --require-terms  an EMPTY term list fails instead of passing           — CI (pr-domain.yml)
//   --repo <dir>     the git repo the diff modes read (default: this framework checkout)
// The diff modes fail CLOSED: a git error is a failure, never "nothing to scan".
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";
import { knownProjectTerms, readInstallsMap } from "./known-projects.js";
import { loadDenylist, findTerms, addedLines } from "./denylist.js";

const FRAMEWORK_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TREES = ["ui", "plugin", "domains", "scripts"];
/** Text files worth reading. Anything else cannot leak a name a human typed. */
const TEXT = /\.(js|mjs|cjs|ts|tsx|jsx|json|md|sh|bash|yml|yaml|css|html|txt)$/i;
const ZERO_SHA = /^0+$/;

const argv = process.argv.slice(2);
const MODE = argv.includes("--push") ? "push" : argv.includes("--staged") ? "staged" : "tree";
const REQUIRE_TERMS = argv.includes("--require-terms");
const repoAt = argv.indexOf("--repo");
const REPO = repoAt >= 0 && argv[repoAt + 1] ? path.resolve(argv[repoAt + 1] ?? "") : FRAMEWORK_DIR;

/** @param {string} msg @returns {never} */
function fail(msg) {
  console.error(`✗ project-names: ${msg}`);
  process.exit(1);
}

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
let denylisted = [];
try {
  denylisted = loadDenylist().terms;
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
const terms = [
  ...new Set([
    ...knownProjectTerms({ installs: readInstallsMap(), boundProjectDir: boundProjectDir() }),
    ...denylisted,
  ]),
].sort();

if (terms.length === 0) {
  if (REQUIRE_TERMS)
    fail(
      "--require-terms: the term list is EMPTY, so this gate would see nothing.\n" +
        "  In CI set the XENOMOON_DENYLIST_TERMS secret (docs/process/denylist.md).",
    );
  // No registry and nothing bound — CI, or a fresh machine. Nothing to look for, and saying so
  // is the point: a gate that cannot see must not report as if it did.
  console.log(
    "ok  project-names: no known projects and no denylist on this machine — nothing to check against.",
  );
  process.exit(0);
}

/** @param {string[]} args @returns {string} */
function git(args) {
  return execFileSync("git", args, {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Tracked files under the framework trees. @returns {string[]} */
function trackedFiles() {
  try {
    return git(["ls-files", "--", ...TREES])
      .split("\n")
      .filter((f) => f && TEXT.test(f));
  } catch {
    return [];
  }
}

/** Hits in a patch's added lines and touched paths. @param {string} patch @param {string} label
 * @returns {import("./denylist.js").TermHit[]} */
function scanPatch(patch, label) {
  /** @type {import("./denylist.js").TermHit[]} */
  const out = [];
  for (const [file, lines] of addedLines(patch))
    for (const h of findTerms(lines.join("\n"), file, terms))
      out.push({ ...h, file: `${label}${file}`, line: 0 });
  return out;
}

/** git-log revision args for one pre-push stdin line, or null when nothing is being sent.
 * @param {string} line @returns {string[] | null} */
function pushRange(line) {
  const [, localSha = "", , remoteSha = ""] = line.trim().split(/\s+/);
  if (!localSha || ZERO_SHA.test(localSha)) return null; // a delete pushes no content
  if (remoteSha && !ZERO_SHA.test(remoteSha)) {
    try {
      git(["cat-file", "-e", `${remoteSha}^{commit}`]);
      return [`${remoteSha}..${localSha}`];
    } catch {
      /* remote tip unknown locally — fall back to everything no remote has */
    }
  }
  return [localSha, "--not", "--remotes"];
}

/** @returns {import("./denylist.js").TermHit[]} */
function scanTree() {
  /** @type {import("./denylist.js").TermHit[]} */
  const out = [];
  for (const rel of trackedFiles()) {
    /** @type {string} */
    let text;
    try {
      text = readFileSync(path.join(REPO, rel), "utf8");
    } catch {
      continue; // unreadable file — not evidence of anything
    }
    out.push(...findTerms(text, rel, terms));
  }
  return out;
}

/** @returns {import("./denylist.js").TermHit[]} */
function scanStaged() {
  try {
    return scanPatch(git(["diff", "--cached", "-U0", "--no-color", "--no-ext-diff"]), "");
  } catch (e) {
    return fail(`cannot read the staged diff: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** @returns {import("./denylist.js").TermHit[]} */
function scanPush() {
  /** @type {import("./denylist.js").TermHit[]} */
  const out = [];
  const stdin = readFileSync(0, "utf8");
  for (const line of stdin.split("\n")) {
    if (!line.trim()) continue;
    const range = pushRange(line);
    if (!range) continue;
    try {
      const log = git(["log", "-p", "-U0", "--no-color", "--no-ext-diff", "--format=", ...range]);
      out.push(...scanPatch(log, `${line.trim().split(/\s+/)[0] ?? ""} → `));
    } catch (e) {
      fail(`cannot read the pushed commits: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

const hits = MODE === "push" ? scanPush() : MODE === "staged" ? scanStaged() : scanTree();
const where = {
  tree: "framework source",
  staged: "the staged changes",
  push: "the pushed commits",
}[MODE];

if (hits.length > 0) {
  console.error(
    `✗ project-names: ${hits.length} reference(s) to a known project or denylisted name in ${where}:`,
  );
  for (const h of hits)
    console.error(`    ${h.file}${h.line ? `:${h.line}` : ""} — "${h.term}"\n      ${h.text}`);
  console.error(
    "  The framework ships to every project. Use a neutral name (alpha/beta) in examples and\n" +
      "  tests; a project's own facts belong in that project's repo.",
  );
  process.exit(1);
}
console.log(
  `ok  project-names: none of ${terms.length} known project/denylisted term(s) in ${where}.`,
);
