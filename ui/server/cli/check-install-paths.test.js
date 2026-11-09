// check-install-paths (#73 row 8): a pack's `library/<kind>/index.md` is a sanctioned merge target,
// a tracked RECORD is still a collision. The script reads `git ls-files` of the framework it sits
// in, so each test copies it into a throwaway git repo (temp dir) and runs it there as a process;
// the real repo's index is never written.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./check-install-paths.js", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "check-install-paths-test-"));
after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Env without the caller's GIT_* (a hook run would point git at the real repo). */
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")));

/** A committed temp framework holding `files` plus the script; returns the check's result.
 * @param {string} name @param {Record<string, string>} files */
function run(name, files) {
  const dir = path.join(tmp, name);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  const script = path.join(dir, "ui/server/cli/check-install-paths.js");
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.copyFileSync(SCRIPT, script);
  const git = (/** @type {string[]} */ ...args) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t.invalid", ...args], {
      cwd: dir,
      env,
      stdio: "ignore",
    });
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "fixture");
  const r = spawnSync("node", [script], { encoding: "utf8", env });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test("a pack kind index over a tracked CORE kind index is sanctioned and counted", () => {
  const r = run("sanctioned", {
    "plugin/library/sources/index.md": "# sources\n",
    "domains/p/plugin/library/sources/index.md": "# sources\n",
  });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /\(1 sanctioned merge target\(s\): plugin\/library\/sources\/index\.md\)/);
});

test("a pack record over a tracked CORE record still collides", () => {
  const r = run("record", {
    "plugin/library/sources/framework-sources.md": "core\n",
    "domains/p/plugin/library/sources/framework-sources.md": "pack\n",
  });
  assert.equal(r.code, 1);
  assert.match(r.err, /installs over TRACKED plugin\/library\/sources\/framework-sources\.md/);
});

test("an index.md nested deeper than library/<kind>/ still collides", () => {
  const r = run("nested", {
    "plugin/library/sources/sub/index.md": "core\n",
    "domains/p/plugin/library/sources/sub/index.md": "pack\n",
  });
  assert.equal(r.code, 1);
  assert.match(r.err, /installs over TRACKED plugin\/library\/sources\/sub\/index\.md/);
});
