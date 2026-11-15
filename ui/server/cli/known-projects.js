// Every project name this machine could leak into the framework.
//
// The contamination gates derived their forbidden terms from the ONE bound project. The trunk
// binds no project, so the term list was empty and the gates passed by having nothing to look
// for — blind in exactly the tree where framework code is written. A real project name reached
// a committed test that way, and `npm run validate` was green the whole time.
//
// So the terms come from the install REGISTRY as well: every install on this machine lists the
// projects it drives (its `projects` map), which is precisely the set of names an author might
// type by accident.
// Machine-local and uncommitted, so nothing project-specific enters the repo.
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { parseJSON } from "../../lib/json.js";
import { salvageProfiles } from "./profiles.js";
import { denylistFor, businessTermsFor } from "../features/promotions/contamination.js";

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

/** Every project directory ONE install serves: each entry of its `projects` map, plus the root
 * `projectDir` of a single-project install when the file still carries one. The one reader of
 * `.xenomoon.json` the name guards share (gen-contamination.js, check-spine-agnostic.sh,
 * knownProjectTerms). A name guard must not go blind because of launch metadata (#65): every
 * dir that is itself a non-empty string counts even when another field of the file is invalid
 * (profiles.js salvageProfiles). A missing file, invalid JSON or a non-object root gives [].
 * @param {string} installDir
 * @param {{ readFile?: (file: string) => string }} [deps]
 * @returns {string[]} unique, in map order then the root dir */
export function installProjectDirs(installDir, deps = {}) {
  const trusted = salvageProfiles(installDir, deps);
  if (!trusted) return [];
  const dirs = trusted.entries.flatMap((e) => (e.dir === null ? [] : [e.dir]));
  if (trusted.projectDir) dirs.push(trusted.projectDir);
  return [...new Set(dirs)];
}

/** The contamination terms of ONE install: the union over all its project dirs of
 * `denylistFor` (proper nouns) and `businessTermsFor` (verbatim fact lines), deduplicated.
 * No project → both empty, and the caller's universal signals still run.
 * @param {string} installDir
 * @param {{ readFile?: (file: string) => string }} [deps]
 * @returns {{ denylist: string[], businessTerms: string[] }} */
export function installTerms(installDir, deps = {}) {
  const dirs = installProjectDirs(installDir, deps);
  return {
    denylist: [...new Set(dirs.flatMap(denylistFor))],
    businessTerms: [...new Set(dirs.flatMap(businessTermsFor))],
  };
}

/** Project terms from every project of every install this machine has registered, plus an
 * explicitly bound one. Each registry KEY is an install; its `.xenomoon.json` lists the projects
 * (installProjectDirs). A registry VALUE that is a string (an install registered before the map
 * existed) still contributes. A profile NAME (the map key) is not a term by itself: only dirs are.
 *
 * An install whose directory is gone still counts through its registry value: its name is
 * exactly as leakable as a live one, and the registry entry is the only record that it existed.
 * @param {{ installs?: Record<string, unknown>, boundProjectDir?: string,
 *   readFile?: (file: string) => string }} opts
 * @returns {string[]} sorted, unique, usable */
export function knownProjectTerms({ installs = {}, boundProjectDir = "", readFile } = {}) {
  const deps = readFile ? { readFile } : {};
  /** @type {Set<string>} */
  const dirs = new Set();
  for (const [install, value] of Object.entries(installs)) {
    for (const d of installProjectDirs(install, deps)) dirs.add(d);
    if (typeof value === "string" && value) dirs.add(value);
  }
  if (boundProjectDir) dirs.add(boundProjectDir);
  return [...new Set([...dirs].flatMap(namesFor))].filter(isUsableTerm).sort();
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
