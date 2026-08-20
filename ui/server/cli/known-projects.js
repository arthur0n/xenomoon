// Every project name this machine could leak into the framework.
//
// The contamination gates derived their forbidden terms from the ONE bound project. The trunk
// binds no project, so the term list was empty and the gates passed by having nothing to look
// for — blind in exactly the tree where framework code is written. A real project name reached
// a committed test that way, and `npm run validate` was green the whole time.
//
// So the terms come from the install REGISTRY as well: every install on this machine names the
// project it drives, which is precisely the set of names an author might type by accident.
// Machine-local and uncommitted, so nothing project-specific enters the repo.
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { parseJSON } from "../../lib/json.js";

/** Words too generic to be evidence of anything. A project named `api` would otherwise make
 * the gate reject the framework's own vocabulary on every line. */
const TOO_GENERIC = new Set([
  "ui",
  "app",
  "api",
  "web",
  "src",
  "lib",
  "core",
  "main",
  "test",
  "tests",
  "docs",
  "node",
  "code",
  "data",
  "site",
  "www",
  "dev",
  "new",
  "temp",
  "tmp",
  "project",
  "default",
]);

/** Whether a term is distinctive enough to accuse a file of contamination.
 * @param {string} term @returns {boolean} */
export function isUsableTerm(term) {
  return term.length >= 4 && !TOO_GENERIC.has(term);
}

/** The names one project directory answers to: its folder, and its package name.
 * @param {string} projectDir @returns {string[]} */
export function namesFor(projectDir) {
  /** @type {string[]} */
  const names = [path.basename(projectDir).toLowerCase()];
  try {
    const pkg = /** @type {{ name?: string }} */ (
      parseJSON(readFileSync(path.join(projectDir, "package.json"), "utf8"))
    );
    if (pkg.name) names.push(pkg.name.replace(/^@[^/]+\//, "").toLowerCase());
  } catch {
    /* no package.json — the folder name still stands */
  }
  return names;
}

/** Project terms from every install this machine has registered, plus an explicitly bound one.
 *
 * An install whose directory is gone still counts: its name is exactly as leakable as a live
 * one, and the registry entry is the only record that it existed.
 * @param {{ installs?: Record<string, unknown>, boundProjectDir?: string }} opts
 * @returns {string[]} sorted, unique, usable */
export function knownProjectTerms({ installs = {}, boundProjectDir = "" } = {}) {
  /** @type {Set<string>} */
  const terms = new Set();
  for (const projectDir of Object.values(installs)) {
    if (typeof projectDir !== "string" || !projectDir) continue;
    for (const n of namesFor(projectDir)) terms.add(n);
  }
  if (boundProjectDir) for (const n of namesFor(boundProjectDir)) terms.add(n);
  return [...terms].filter(isUsableTerm).sort();
}

/** The registry's install→project map, read straight from disk. Empty when absent, so CI —
 * which has no registry and no project names to leak — behaves exactly as before.
 * @param {string} [file] @returns {Record<string, unknown>} */
export function readInstallsMap(file = process.env.XENOMOON_REGISTRY) {
  const target = file ?? path.join(process.env.HOME ?? "", ".xenomoon", "installs.json");
  try {
    if (!existsSync(target)) return {};
    const raw = /** @type {{ installs?: Record<string, unknown> }} */ (
      parseJSON(readFileSync(target, "utf8"))
    );
    return raw.installs ?? {};
  } catch {
    return {};
  }
}
