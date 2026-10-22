// The LOCAL denylist — client and project names this machine must never let into the repo.
//
// The registry (known-projects.js) only knows projects that have an install. Names that never
// get one (a client, a codename, a customer) need a list of their own, and that list must live
// OUTSIDE the repo: committing it would publish the very names it protects. One loader, read by
// every name check (contamination, project-names, the git hooks, CI).
//
// Sources, all merged:
//   • the file  — $XENOMOON_DENYLIST, else ~/.xenomoon/denylist.txt (a missing default is fine;
//                 a missing EXPLICIT path is a misconfiguration and throws)
//   • the env   — $XENOMOON_DENYLIST_TERMS, newline- or comma-separated (CI reads it from a secret)
// Format: one term per line (commas also split), `#` starts a comment, blank lines ignored,
// matching is whole-word and case-insensitive. See docs/process/denylist.md.
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

/** Parse denylist text into unique lowercase terms.
 * @param {string} text @returns {string[]} */
export function parseDenylist(text) {
  /** @type {Set<string>} */
  const terms = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "");
    for (const part of line.split(",")) {
      const t = part.trim().toLowerCase();
      if (t) terms.add(t);
    }
  }
  return [...terms];
}

/** The denylist file this environment points at.
 * @param {NodeJS.ProcessEnv} [env] @returns {{ file: string, explicit: boolean }} */
export function denylistPath(env = process.env) {
  if (env.XENOMOON_DENYLIST) return { file: env.XENOMOON_DENYLIST, explicit: true };
  return { file: path.join(env.HOME ?? "", ".xenomoon", "denylist.txt"), explicit: false };
}

/** Every denylisted term from the file and the env var, sorted and unique.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ terms: string[], sources: string[] }} sources names where terms came from */
export function loadDenylist(env = process.env) {
  /** @type {Set<string>} */
  const terms = new Set();
  /** @type {string[]} */
  const sources = [];
  const { file, explicit } = denylistPath(env);
  if (existsSync(file)) {
    for (const t of parseDenylist(readFileSync(file, "utf8"))) terms.add(t);
    sources.push(file);
  } else if (explicit) {
    throw new Error(`XENOMOON_DENYLIST points at "${file}", which does not exist`);
  }
  if (env.XENOMOON_DENYLIST_TERMS) {
    for (const t of parseDenylist(env.XENOMOON_DENYLIST_TERMS)) terms.add(t);
    sources.push("XENOMOON_DENYLIST_TERMS");
  }
  return { terms: [...terms].sort(), sources };
}

/** A whole-word, case-insensitive matcher for one term. "Word" means bounded by anything that
 * is not a letter or digit, so `acme-fake` matches in `acme-fake.md` but not in `acme-faker`.
 * @param {string} term @returns {RegExp} */
export function termRegExp(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
}

/** @typedef {{ file: string, line: number, term: string, text: string }} TermHit */

/** Every whole-word hit of any term in one text.
 * @param {string} text @param {string} file @param {string[]} terms @returns {TermHit[]} */
export function findTerms(text, file, terms) {
  /** @type {TermHit[]} */
  const hits = [];
  const lines = text.split("\n");
  for (const term of terms) {
    const re = termRegExp(term);
    if (!re.test(text)) continue; // whole-text test first — most texts match nothing
    lines.forEach((line, i) => {
      if (re.test(line)) hits.push({ file, line: i + 1, term, text: line.trim().slice(0, 100) });
    });
  }
  return hits;
}

/** The `+++ ` header: the file the following added lines belong to, or none for a deletion.
 * A deletion adds nothing, so its own path is dropped too — removing a leak must never be
 * blocked by the leaked name.
 * @param {string} line @param {string | undefined} key @param {Map<string, string[]>} byFile
 * @param {(file: string) => string[]} entry @returns {string[] | undefined} */
function headerTarget(line, key, byFile, entry) {
  const target = line.slice(4).replace(/^b\//, "");
  if (target !== "/dev/null") return entry(target);
  if (key && byFile.get(key)?.length === 1) byFile.delete(key);
  return undefined;
}

/** The ADDED lines of a unified diff (`git diff -U0` / `git log -p -U0`), grouped by file, plus
 * each touched path itself (a file NAMED after a client leaks as surely as its content).
 * Header lines are only read between `diff --git` and the first `@@`, so an added line whose
 * content starts with `++ ` is never mistaken for a file header.
 * @param {string} patch @returns {Map<string, string[]>} file → [path, ...added lines] */
export function addedLines(patch) {
  /** @type {Map<string, string[]>} */
  const byFile = new Map();
  /** @param {string} file @returns {string[]} */
  const entry = (file) => {
    const lines = byFile.get(file) ?? [file];
    byFile.set(file, lines);
    return lines;
  };
  /** @type {string[] | undefined} */
  let current;
  /** @type {string | undefined} */
  let currentKey;
  let inHeader = false;
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      inHeader = true;
      const m = / b\/(.*)$/.exec(line);
      currentKey = m?.[1];
      current = currentKey ? entry(currentKey) : undefined;
    } else if (inHeader && line.startsWith("@@")) {
      inHeader = false;
    } else if (inHeader && line.startsWith("+++ ")) {
      current = headerTarget(line, currentKey, byFile, entry);
    } else if (!inHeader && current && line.startsWith("+")) {
      current.push(line.slice(1));
    }
  }
  return byFile;
}
