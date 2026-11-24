// The framework checkout's publishing remote and its `owner/name`, and whether a command merges on
// it. Lives in ui/lib so the session hooks (plugin/hooks/*.mjs, which import only ui/lib), the
// web UI gate and the server CLIs share one definition.
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mergesFrameworkRepo } from "./consequential.js";

/** @typedef {(dir: string, args: string[]) => { status: number | null, stdout: string }} GitRunner */

/** @type {GitRunner} */
export const runGit = (dir, args) => {
  const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout ?? "" };
};

/** `owner/name` from an https, ssh:// or scp-style (`git@host:owner/name.git`) remote URL.
 * @param {string} url @returns {string | null} */
export function repoFromUrl(url) {
  const m = /^(?:[a-z+]+:\/\/[^/]+\/|[^@/:\s]+@[^:/\s]+:)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(
    url.trim(),
  );
  return m ? `${m[1]}/${m[2]}` : null;
}

/** The non-empty output lines of a git call, or none when it failed.
 * @param {{ status: number | null, stdout: string }} r @returns {string[]} */
const linesOf = (r) =>
  r.status === 0
    ? r.stdout
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

/**
 * The one publishing remote of the checkout at `dir`: `xenomoon` when present, else `origin`, and
 * the `owner/name` its push goes to (`git remote get-url --push --all`, which applies `pushurl`
 * and `pushInsteadOf`). `{ error }` when there is no such remote, a fetch or push URL contains
 * `xenodot-forge`, there is not exactly one push URL, a URL has no `owner/name` (a local path),
 * or the push goes to another repo than the fetch.
 * @param {string} dir @param {{ run?: GitRunner }} [deps]
 * @returns {{ remote: string, repo: string } | { error: string }}
 */
export function frameworkRemote(dir, { run = runGit } = {}) {
  const names = linesOf(run(dir, ["remote"]));
  const remote = ["xenomoon", "origin"].find((n) => names.includes(n));
  if (!remote) return { error: "this checkout has neither a 'xenomoon' nor an 'origin' remote" };
  const [url = ""] = linesOf(run(dir, ["remote", "get-url", remote]));
  const pushUrls = linesOf(run(dir, ["remote", "get-url", "--push", "--all", remote]));
  if ([url, ...pushUrls].some((u) => u.includes("xenodot-forge"))) {
    return {
      error: `remote '${remote}' points at a xenodot-forge repo, which is never published to`,
    };
  }
  if (pushUrls.length !== 1) {
    return {
      error: `remote '${remote}' has ${pushUrls.length} push URLs; publishing needs exactly one`,
    };
  }
  const fetched = repoFromUrl(url);
  if (!fetched) return { error: `remote '${remote}' has no owner/name URL` };
  const pushUrl = pushUrls[0] ?? "";
  const repo = repoFromUrl(pushUrl);
  if (!repo) return { error: `remote '${remote}' pushes to ${pushUrl}, which has no owner/name` };
  if (repo.toLowerCase() !== fetched.toLowerCase()) {
    return {
      error: `remote '${remote}' fetches from ${fetched} but pushes to ${repo}; make them the same repo before publishing`,
    };
  }
  return { remote, repo };
}

/** The framework's `owner/name`, or null when `frameworkRemote` gives `{ error }` or throws.
 * @param {string} dir @returns {string | null} */
export function frameworkRepo(dir) {
  try {
    const got = frameworkRemote(dir);
    return "repo" in got && typeof got.repo === "string" ? got.repo : null;
  } catch {
    return null;
  }
}

/** @param {string} p @returns {string} the real path, or `p` when it cannot be resolved */
function real(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Does `cmd`, run in the folder `cwd`, merge on the framework repo? Gathers the facts (real
 * folders, the framework's `owner/name`) and judges them with the pure `mergesFrameworkRepo`.
 * The repo is read only for a merge-shaped command, through `readRepo` (a caller may cache it).
 * @param {string} cmd @param {unknown} cwd @param {string} frameworkDir
 * @param {{ readRepo?: (dir: string) => string | null }} [deps]
 * @returns {boolean}
 */
export function mergesFrameworkAt(cmd, cwd, frameworkDir, { readRepo = frameworkRepo } = {}) {
  // The cheap pre-test: merge words, and the two GraphQL merge mutations (no word boundary there).
  if (!/\b(merge|merges|promote)\b|mergePullRequest|enablePullRequestAutoMerge/i.test(cmd))
    return false;
  const dir = real(frameworkDir);
  const repo = readRepo(dir);
  const here = typeof cwd === "string" && cwd ? real(cwd) : "";
  return mergesFrameworkRepo(cmd, here, dir, repo) === true;
}
