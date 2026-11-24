// Main guard of a bound install: a framework checkout that runs projects refuses a commit on
// `main` and a push of `main`. `--commit` is for the pre-commit hook, `--push` for pre-push
// (ref lines on stdin). The functions take the checkout dir, so tests can use temp folders.
// A `.xenomoon.json` that exists but cannot be read or parsed counts as bound (fail closed).
import { accessSync, constants, existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runGit } from "../../lib/framework-remote.js";
import { readInstallConfigStrict } from "../../lib/install-config.js";
import { installProjectDirs } from "./known-projects.js";

export { frameworkRemote, repoFromUrl, runGit } from "../../lib/framework-remote.js";

/** @typedef {import("../../lib/framework-remote.js").GitRunner} GitRunner */
/** @typedef {{ bound: boolean, why?: string }} BoundState */

export const REFUSAL = [
  "This framework folder runs projects, so nothing is committed or pushed on main here.",
  "Make a branch and open a PR: issuekit framework-fix start <slug>",
].join("\n");

/** The path husky 9 writes into `core.hooksPath` (node_modules/husky/index.js:8,14). */
export const HUSKY_HOOKS_PATH = ".husky/_";

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Whether `<dir>/.xenomoon.json` binds a project, and why when it is bound by a broken file.
 * Missing → not bound. Unreadable, empty, not JSON, not an object, or a `projects` field that
 * is not an object → bound, with `why`. Otherwise bound when the `projects` map has an entry
 * or the file names a project dir (installProjectDirs, which also counts an old root `projectDir`).
 * @param {string} dir
 * @param {{ readConfig?: typeof readInstallConfigStrict, projectDirs?: typeof installProjectDirs }} [deps]
 * @returns {BoundState}
 */
export function boundInstallState(dir, deps = {}) {
  const { readConfig = readInstallConfigStrict, projectDirs = installProjectDirs } = deps;
  const read = readConfig(dir);
  if ("error" in read) {
    const why = read.error.replace(/; nothing was written$/, "");
    return { bound: true, why: `${why}; treated as a bound install` };
  }
  if (!read.existed) return { bound: false };
  const { projects } = read.config;
  if (projects !== undefined && !isPlainObject(projects)) {
    return { bound: true, why: "projects is not an object; treated as a bound install" };
  }
  const named = isPlainObject(projects) && Object.keys(projects).length > 0;
  return { bound: named || projectDirs(dir).length > 0 };
}

/** @param {string} dir @param {Parameters<typeof boundInstallState>[1]} [deps] @returns {boolean} */
export function boundInstall(dir, deps = {}) {
  return boundInstallState(dir, deps).bound;
}

/** The generated hooks git must be able to run in `.husky/_` for the guard to work. husky 9 writes
 * them with mode 0o755 (node_modules/husky/index.js:22). */
export const GUARD_HOOKS = ["pre-commit", "pre-push", "pre-merge-commit"];

/** Whether git can run the hook file at `p`: it exists and is executable, since git skips a hook
 * without the execute bit. On Windows there is no execute bit, so existence is enough.
 * @param {string} p @param {NodeJS.Platform} [platform] @returns {boolean} */
export function hookRunnable(p, platform = process.platform) {
  if (platform === "win32") return existsSync(p);
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Whether the repo at `dir` runs husky's hooks: `core.hooksPath` is `.husky/_` and git can run
 * every GUARD_HOOKS file there. @param {string} dir
 * @param {{ run?: GitRunner, runnable?: (p: string) => boolean }} [deps] @returns {boolean} */
export function hooksActive(dir, { run = runGit, runnable = hookRunnable } = {}) {
  const r = run(dir, ["config", "--get", "core.hooksPath"]);
  const value = r.status === 0 ? r.stdout.trim() : "";
  if (!value) return false;
  const hooks = path.resolve(dir, HUSKY_HOOKS_PATH);
  if (path.resolve(dir, value) !== hooks) return false;
  return GUARD_HOOKS.every((h) => runnable(path.join(hooks, h)));
}

/**
 * The warning for a bound install whose husky hooks are off, or null. `npm ci` runs the
 * `prepare` script (`husky || true`, package.json), which sets `core.hooksPath` to `.husky/_`.
 * @param {string} dir @param {Parameters<typeof hooksActive>[1] & Parameters<typeof boundInstallState>[1]} [deps]
 * @returns {string | null}
 */
export function hooksOffWarning(dir, deps = {}) {
  if (!boundInstall(dir, deps) || hooksActive(dir, deps)) return null;
  return `git hooks are not active in ${dir}, so main is not protected there; run \`npm ci\` in that folder`;
}

/** The checked-out branch name, or null on a detached HEAD.
 * @param {string} dir @param {{ run?: GitRunner }} [deps] @returns {string | null} */
export function currentBranch(dir, { run = runGit } = {}) {
  const r = run(dir, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  return r.status === 0 ? r.stdout.trim() || null : null;
}

/** Whether any pre-push line (`<local ref> <local sha> <remote ref> <remote sha>`, githooks(5))
 * targets `refs/heads/main`. @param {string} stdin @returns {boolean} */
export function pushesMain(stdin) {
  return stdin.split("\n").some((line) => line.trim().split(/\s+/)[2] === "refs/heads/main");
}

/** The refusal text for a bound state. @param {BoundState} state @returns {string} */
const refusalFor = (state) => (state.why ? `${REFUSAL}\n(${state.why})` : REFUSAL);

/**
 * Refusal for a commit at `dir`, or null when it may proceed.
 * @param {string} dir @param {{ run?: GitRunner } & Parameters<typeof boundInstallState>[1]} [deps]
 * @returns {string | null}
 */
export function commitRefusal(dir, deps = {}) {
  const state = boundInstallState(dir, deps);
  if (!state.bound || currentBranch(dir, deps) !== "main") return null;
  return refusalFor(state);
}

/**
 * Refusal for a push at `dir` with the given pre-push stdin, or null when it may proceed.
 * @param {string} dir @param {string} stdin @param {Parameters<typeof boundInstallState>[1]} [deps]
 * @returns {string | null}
 */
export function pushRefusal(dir, stdin, deps = {}) {
  if (!pushesMain(stdin)) return null;
  const state = boundInstallState(dir, deps);
  return state.bound ? refusalFor(state) : null;
}

/** CLI: `--commit` or `--push`, acting on the checkout this script lives in. */
function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const mode = process.argv[2];
  /** @type {string | null} */
  let refusal;
  if (mode === "--commit") refusal = commitRefusal(root);
  else if (mode === "--push") refusal = pushRefusal(root, readFileSync(0, "utf8"));
  else {
    process.stderr.write("usage: install-main-guard.js --commit | --push\n");
    process.exit(2);
  }
  if (refusal) {
    process.stderr.write(`${refusal}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
