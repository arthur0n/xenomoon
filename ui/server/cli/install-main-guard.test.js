// The main guard of a bound install: what counts as bound, when a commit or push is refused,
// which remote is the framework's own, and that both husky hooks call the guard.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  boundInstall,
  boundInstallState,
  commitRefusal,
  pushRefusal,
  pushesMain,
  frameworkRemote,
  GUARD_HOOKS,
  hookRunnable,
  hooksActive,
  hooksOffWarning,
  REFUSAL,
} from "./install-main-guard.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const noProjectDirs = () => [];

/** A temp folder that is removed when the test ends. @param {import("node:test").TestContext} t */
function tempDir(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "main-guard-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

/** @param {string} dir @param {unknown} cfg */
function writeConfig(dir, cfg) {
  const text = typeof cfg === "string" ? cfg : JSON.stringify(cfg);
  writeFileSync(path.join(dir, ".xenomoon.json"), text);
}

/** @param {string} dir @param {string[]} args */
function git(dir, args) {
  const r = spawnSync("git", ["-C", dir, "-c", "core.hooksPath=/dev/null", ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
  });
  assert.equal(r.status, 0, r.stderr);
}

/** A real git repo on `main` with one commit. @param {import("node:test").TestContext} t */
function repoOnMain(t) {
  const dir = tempDir(t);
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, [
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.invalid",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "x",
  ]);
  return dir;
}

/** A GitRunner that answers `remote`, `remote get-url` and `remote get-url --push --all` from a
 * name → url map; an entry `{ fetch, push }` gives push URLs that differ from the fetch URL.
 * @param {Record<string, string | { fetch: string, push: string[] }>} remotes */
function fakeRemotes(remotes) {
  return (/** @type {string} */ _dir, /** @type {string[]} */ args) => {
    if (args[1] !== "get-url") return { status: 0, stdout: Object.keys(remotes).join("\n") };
    const entry = remotes[args.at(-1) ?? ""];
    if (entry === undefined) return { status: 2, stdout: "" };
    const { fetch, push } = typeof entry === "string" ? { fetch: entry, push: [entry] } : entry;
    return { status: 0, stdout: `${(args.includes("--push") ? push : [fetch]).join("\n")}\n` };
  };
}

test("bound state: no file is not bound, one project is, an empty projects map is not", (t) => {
  const none = tempDir(t);
  assert.equal(boundInstall(none, { projectDirs: noProjectDirs }), false);
  const one = tempDir(t);
  writeConfig(one, { projects: { alpha: { dir: "/ws/alpha" } } });
  assert.equal(boundInstall(one, { projectDirs: noProjectDirs }), true);
  const empty = tempDir(t);
  writeConfig(empty, { projects: {} });
  assert.equal(boundInstall(empty, { projectDirs: noProjectDirs }), false);
});

test("bound state: a file that is not valid JSON counts as bound and says why", (t) => {
  const dir = tempDir(t);
  writeConfig(dir, "{ not json");
  const state = boundInstallState(dir);
  assert.equal(state.bound, true);
  assert.match(state.why ?? "", /not valid JSON.*treated as a bound install/);
});

test("commitRefusal: bound on main refuses and names the way out", (t) => {
  const dir = repoOnMain(t);
  writeConfig(dir, { projects: { alpha: { dir: "/ws/alpha" } } });
  const text = commitRefusal(dir);
  assert.equal(text, REFUSAL);
  assert.match(text ?? "", /issuekit framework-fix start/);
});

test("commitRefusal: bound on a branch passes", (t) => {
  const dir = repoOnMain(t);
  git(dir, ["checkout", "-q", "-b", "fix/x"]);
  writeConfig(dir, { projects: { alpha: { dir: "/ws/alpha" } } });
  assert.equal(commitRefusal(dir), null);
});

test("commitRefusal: bound on a detached HEAD passes", (t) => {
  const dir = repoOnMain(t);
  git(dir, ["checkout", "-q", "--detach"]);
  writeConfig(dir, { projects: { alpha: { dir: "/ws/alpha" } } });
  assert.equal(commitRefusal(dir), null);
});

test("commitRefusal: unbound on main passes", (t) => {
  const dir = repoOnMain(t);
  assert.equal(commitRefusal(dir, { projectDirs: noProjectDirs }), null);
});

test("pushRefusal: a main line refuses when bound, a fix branch passes, several lines refuse on one main", (t) => {
  const dir = tempDir(t);
  writeConfig(dir, { projects: { alpha: { dir: "/ws/alpha" } } });
  const main = "refs/heads/main aaa refs/heads/main bbb";
  const fix = "refs/heads/fix/x aaa refs/heads/fix/x 000";
  assert.equal(pushRefusal(dir, `${main}\n`), REFUSAL);
  assert.equal(pushRefusal(dir, `${fix}\n`), null);
  assert.equal(pushRefusal(dir, `${fix}\n${main}\n${fix}\n`), REFUSAL);
});

test("pushRefusal: unbound passes a main push; pushesMain is false on empty stdin", (t) => {
  const dir = tempDir(t);
  assert.equal(
    pushRefusal(dir, "refs/heads/main aaa refs/heads/main bbb\n", { projectDirs: noProjectDirs }),
    null,
  );
  assert.equal(pushesMain(""), false);
  assert.equal(pushRefusal(dir, ""), null);
});

test("frameworkRemote: only origin gives origin and owner/name from https and scp forms", () => {
  const https = frameworkRemote("/x", {
    run: fakeRemotes({ origin: "https://github.com/acme/forge.git" }),
  });
  assert.deepEqual(https, { remote: "origin", repo: "acme/forge" });
  const scp = frameworkRemote("/x", {
    run: fakeRemotes({ origin: "git@github.com:acme/forge.git" }),
  });
  assert.deepEqual(scp, { remote: "origin", repo: "acme/forge" });
});

test("frameworkRemote: xenomoon wins over another remote", () => {
  const run = fakeRemotes({
    origin: "https://github.com/acme/other.git",
    xenomoon: "git@github.com:acme/forge.git",
  });
  assert.deepEqual(frameworkRemote("/x", { run }), { remote: "xenomoon", repo: "acme/forge" });
});

test("frameworkRemote: a xenodot-forge origin without xenomoon, and no remote, are errors", () => {
  const forge = frameworkRemote("/x", {
    run: fakeRemotes({ origin: "https://github.com/acme/xenodot-forge.git" }),
  });
  assert.ok("error" in forge && /xenodot-forge/.test(forge.error));
  const none = frameworkRemote("/x", { run: fakeRemotes({}) });
  assert.ok("error" in none && /neither/.test(none.error));
});

test("frameworkRemote: repo is the push destination; a pushurl to the same repo passes", () => {
  const run = fakeRemotes({
    origin: { fetch: "https://github.com/acme/forge.git", push: ["git@github.com:Acme/Forge.git"] },
  });
  assert.deepEqual(frameworkRemote("/x", { run }), { remote: "origin", repo: "Acme/Forge" });
});

test("frameworkRemote: a push URL to another repo, two push URLs, a xenodot-forge push URL, a local push path are refused", () => {
  const fetch = "https://github.com/acme/forge.git";
  /** @param {string[]} push */
  const errorOf = (push) => {
    const got = frameworkRemote("/x", { run: fakeRemotes({ origin: { fetch, push } }) });
    assert.ok("error" in got, `expected an error for ${push.join(", ")}`);
    return got.error;
  };
  assert.match(
    errorOf(["https://github.com/other/place.git"]),
    /fetches from acme\/forge but pushes to other\/place/,
  );
  assert.match(errorOf([fetch, "https://github.com/acme/mirror.git"]), /2 push URLs/);
  assert.match(errorOf(["https://github.com/acme/xenodot-forge.git"]), /xenodot-forge/);
  assert.match(errorOf(["/tmp/bare.git"]), /pushes to \/tmp\/bare\.git, which has no owner\/name/);
});

test("hooksActive: true for .husky/_ with the guard hooks runnable, false when unset or a hook is not", () => {
  const answer = (/** @type {number} */ status, /** @type {string} */ stdout) => () => ({
    status,
    stdout,
  });
  const all = () => true;
  assert.equal(hooksActive("/x", { run: answer(0, ".husky/_\n"), runnable: all }), true);
  assert.equal(hooksActive("/x", { run: answer(1, ""), runnable: all }), false);
  assert.equal(hooksActive("/x", { run: answer(0, ".githooks\n"), runnable: all }), false);
  for (const missing of ["pre-commit", "pre-push", "pre-merge-commit"]) {
    const runnable = (/** @type {string} */ p) => path.basename(p) !== missing;
    assert.equal(hooksActive("/x", { run: answer(0, ".husky/_\n"), runnable }), false, missing);
  }
});

test("hookRunnable: an executable file only; on Windows any existing file", (t) => {
  const dir = tempDir(t);
  const exe = path.join(dir, "exe");
  const plain = path.join(dir, "plain");
  writeFileSync(exe, "", { mode: 0o755 });
  writeFileSync(plain, "", { mode: 0o644 });
  if (process.platform !== "win32") {
    assert.equal(hookRunnable(exe, "darwin"), true);
    assert.equal(hookRunnable(plain, "linux"), false);
  }
  assert.equal(hookRunnable(path.join(dir, "absent"), "darwin"), false);
  assert.equal(hookRunnable(plain, "win32"), true);
  assert.equal(hookRunnable(path.join(dir, "absent"), "win32"), false);
});

test("hooksOffWarning: bound with hooks off names the folder and the fix", (t) => {
  const dir = tempDir(t);
  writeConfig(dir, { projects: { alpha: { dir: "/ws/alpha" } } });
  const off = () => ({ status: 1, stdout: "" });
  assert.equal(
    hooksOffWarning(dir, { run: off, projectDirs: noProjectDirs }),
    `git hooks are not active in ${dir}, so main is not protected there; run \`npm ci\` in that folder`,
  );
});

test("hooksOffWarning: hooksPath set to .husky/_ but the generated folder missing is warned", (t) => {
  const dir = tempDir(t);
  writeConfig(dir, { projects: { alpha: { dir: "/ws/alpha" } } });
  const on = () => ({ status: 0, stdout: ".husky/_\n" });
  assert.match(hooksOffWarning(dir, { run: on, projectDirs: noProjectDirs }) ?? "", /not active/);
});

test("hooksOffWarning: null when hooks are on, and when unbound with hooks off", (t) => {
  const bound = tempDir(t);
  writeConfig(bound, { projects: { alpha: { dir: "/ws/alpha" } } });
  mkdirSync(path.join(bound, ".husky", "_"), { recursive: true });
  const hooks = GUARD_HOOKS.map((h) => path.join(bound, ".husky", "_", h));
  for (const h of hooks) writeFileSync(h, "", { mode: 0o644 });
  const on = () => ({ status: 0, stdout: ".husky/_\n" });
  // Git skips a hook without the execute bit, so present but not executable is still off.
  if (process.platform !== "win32")
    assert.match(
      hooksOffWarning(bound, { run: on, projectDirs: noProjectDirs }) ?? "",
      /not active/,
    );
  for (const h of hooks) chmodSync(h, 0o755);
  assert.equal(hooksOffWarning(bound, { run: on, projectDirs: noProjectDirs }), null);
  const off = () => ({ status: 1, stdout: "" });
  assert.equal(hooksOffWarning(tempDir(t), { run: off, projectDirs: noProjectDirs }), null);
});

test("the hooks call the guard: pre-commit and pre-merge-commit with --commit, pre-push with --push after the stdin copy", () => {
  for (const hook of ["pre-commit", "pre-merge-commit"]) {
    const text = readFileSync(path.join(repoRoot, ".husky", hook), "utf8");
    assert.ok(text.includes("install-main-guard.js --commit || exit 1"), hook);
  }
  const push = readFileSync(path.join(repoRoot, ".husky", "pre-push"), "utf8");
  const copy = push.indexOf('pushed_refs="$(cat)"');
  const guard = push.indexOf("install-main-guard.js --push");
  assert.ok(copy >= 0 && guard > copy, "the guard comes after the line that keeps the pushed refs");
});
