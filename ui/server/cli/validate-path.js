// Project-path validator — the install's "folder convention" is VALIDATION, not layout: any
// local absolute path works (same parent as the framework is recommended for tidiness only;
// access never depends on adjacency — sessions get the framework dirs via additionalDirectories
// and env, see docs/process/repo-boundary.md). Deliberately dependency-free (no config.js —
// like setup.js it must run before a domain is bound).
//
//   import { validateProjectPath } from "./validate-path.js";
//   const problems = validateProjectPath(target, FRAMEWORK_DIR, { allowNonlocal: false });
//
// Returns [] when fine, else a list of { hard: boolean, msg: string } — hard rows block the
// install; soft rows warn (and `--allow-nonlocal` downgrades the locality check).
import { existsSync, accessSync, constants, statSync, realpathSync } from "node:fs";
import path from "node:path";
import { contains } from "./profiles.js";

/** Path fragments that mark a cloud-synced or network location — file locks and watchers
 * misbehave there (iCloud rehydration, SMB latency), so the install rejects them softly. */
const NONLOCAL_MARKERS = ["/Mobile Documents/", "/Google Drive/", "/Dropbox/", "/OneDrive/"];

/** The REAL location of `p` (resolved against `base`): its realpath when it exists, else the
 * realpath of its nearest existing ancestor joined with the segments that do not exist yet. Two
 * spellings of one folder (a symlinked parent, macOS /var vs /private/var, a trailing slash, a
 * relative form) give the same string, so containment and project identity compare locations.
 * `realpathSync.native` (realpath(3)) returns the ON-DISK letter case, so on a case-insensitive
 * disk `/x/Shop` and `/x/shop` are one string too; plain realpathSync keeps the caller's case
 * (#65). Segments that do not exist yet keep the spelling given.
 * @param {string} p @param {string} [base] @returns {string} */
export function canonicalPath(p, base = process.cwd()) {
  const abs = path.resolve(base, p);
  /** @type {string[]} */
  const rest = [];
  let cur = abs;
  for (;;) {
    try {
      return path.join(realpathSync.native(cur), ...rest);
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return abs; // nothing on the way up resolves: keep the text
      rest.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

/** Validate a project dir for binding. @param {string} target absolute-or-not user input
 * @param {string} frameworkDir the framework checkout root
 * @param {{ allowNonlocal?: boolean }} [opts]
 * @returns {{ hard: boolean, msg: string }[]} problems ([] = fine) */
export function validateProjectPath(target, frameworkDir, opts = {}) {
  /** @type {{ hard: boolean, msg: string }[]} */
  const problems = [];
  if (!path.isAbsolute(target)) {
    problems.push({
      hard: true,
      msg: `project path must be absolute (got \`${target}\`) — the bind is stored in .xenomoon.json and re-read across sessions`,
    });
    return problems; // everything below needs an absolute path
  }
  // Compared on REAL locations: /var/tmp/x must be seen inside a framework at /private/var/tmp.
  const resolved = canonicalPath(target);
  const framework = canonicalPath(frameworkDir);
  if (contains(framework, resolved))
    problems.push({
      hard: true,
      msg: `project path is INSIDE the framework checkout (${frameworkDir}) — the project must be a separate directory (repo-boundary.md)`,
    });
  if (contains(resolved, framework))
    problems.push({
      hard: true,
      msg: `the framework checkout is inside the project path — nest neither in the other (repo-boundary.md)`,
    });
  const nonlocal = NONLOCAL_MARKERS.find((m) => resolved.includes(m));
  if (nonlocal && !opts.allowNonlocal)
    problems.push({
      hard: false,
      msg: `path looks cloud-synced (\`${nonlocal.replaceAll("/", "")}\`) — file locks/watchers misbehave there; use a local disk, or pass --allow-nonlocal to override`,
    });
  if (existsSync(resolved)) {
    if (!statSync(resolved).isDirectory())
      problems.push({ hard: true, msg: `project path exists but is not a directory` });
    else {
      try {
        accessSync(resolved, constants.W_OK);
      } catch {
        problems.push({ hard: true, msg: `project path is not writable` });
      }
    }
  } else {
    // creatable? the nearest existing ancestor must be writable
    let ancestor = path.dirname(resolved);
    while (!existsSync(ancestor)) ancestor = path.dirname(ancestor);
    try {
      accessSync(ancestor, constants.W_OK);
    } catch {
      problems.push({
        hard: true,
        msg: `project path does not exist and its parent (${ancestor}) is not writable`,
      });
    }
  }
  return problems;
}
