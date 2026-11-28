// plugin/hooks/tree-fingerprint.sh run as a real process against throwaway git repos. It prints the
// tree id of "HEAD plus the whole working tree" (top-level .xenomoon/ left out) and never touches
// the real index. The script is only spawned, never imported.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "plugin",
  "hooks",
  "tree-fingerprint.sh",
);

/** @param {string} bin */
const has = (bin) => spawnSync(bin, ["--version"]).status === 0;
const missing = ["git", "bash"].filter((b) => !has(b));
const skip = missing.length > 0 && `${missing.join(", ")} not on PATH`;

/** The child environment: a copy of ours without any inherited GIT_* key. */
function childEnv() {
  /** @type {NodeJS.ProcessEnv} */
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (k.startsWith("GIT_")) delete e[k];
  return e;
}
const env = childEnv();

/** @type {string[]} */ const roots = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  const r = spawnSync("git", ["-C", cwd, ...args], { env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

function tmp() {
  const d = mkdtempSync(path.join(os.tmpdir(), "tree-fingerprint-"));
  roots.push(d);
  return d;
}

/** A repo with one commit: a.txt, sub/b.txt, .gitignore (ignored.log), .xenomoon/state.json.
 * @param {boolean} commit */
function makeRepo(commit = true) {
  const repo = path.join(tmp(), "repo");
  mkdirSync(path.join(repo, "sub"), { recursive: true });
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "user.name", "t"]);
  git(repo, ["config", "user.email", "t@example.test"]);
  git(repo, ["config", "commit.gpgsign", "false"]);
  writeFileSync(path.join(repo, "a.txt"), "a\n");
  writeFileSync(path.join(repo, "sub", "b.txt"), "b\n");
  writeFileSync(path.join(repo, ".gitignore"), "ignored.log\n");
  if (commit) {
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "init"]);
  }
  return repo;
}

/** @param {string} dir */
function fingerprint(dir) {
  const r = spawnSync("bash", [SCRIPT, dir], { env, encoding: "utf8" });
  return { status: r.status, out: r.stdout, err: r.stderr, id: r.stdout.trim() };
}

/** @param {string} dir */
function ok(dir) {
  const r = fingerprint(dir);
  assert.equal(r.status, 0, r.err);
  assert.match(r.id, /^[0-9a-f]{40,64}$/);
  return r.id;
}

test("clean repo: the id is the tree of HEAD", { skip }, () => {
  const repo = makeRepo();
  assert.equal(ok(repo), git(repo, ["rev-parse", "HEAD^{tree}"]));
});

test("an edit to a tracked file changes the id; staging it does not", { skip }, () => {
  const repo = makeRepo();
  const clean = ok(repo);
  writeFileSync(path.join(repo, "a.txt"), "edited\n");
  const edited = ok(repo);
  assert.notEqual(edited, clean);
  git(repo, ["add", "a.txt"]);
  assert.equal(ok(repo), edited);
});

test("a new untracked file changes the id", { skip }, () => {
  const repo = makeRepo();
  const clean = ok(repo);
  writeFileSync(path.join(repo, "new.txt"), "new\n");
  assert.notEqual(ok(repo), clean);
});

test("a file under top-level .xenomoon/ does not change the id", { skip }, () => {
  const repo = makeRepo();
  const clean = ok(repo);
  mkdirSync(path.join(repo, ".xenomoon"));
  writeFileSync(path.join(repo, ".xenomoon", "state.json"), "{}\n");
  assert.equal(ok(repo), clean);
});

test("an ignored file does not change the id", { skip }, () => {
  const repo = makeRepo();
  const clean = ok(repo);
  writeFileSync(path.join(repo, "ignored.log"), "noise\n");
  assert.equal(ok(repo), clean);
});

test("called from a sub-folder, the id is the same", { skip }, () => {
  const repo = makeRepo();
  writeFileSync(path.join(repo, "new.txt"), "new\n");
  assert.equal(ok(path.join(repo, "sub")), ok(repo));
});

test("the real index and status are unchanged by a run", { skip }, () => {
  const repo = makeRepo();
  writeFileSync(path.join(repo, "a.txt"), "edited\n");
  writeFileSync(path.join(repo, "new.txt"), "new\n");
  git(repo, ["add", "a.txt"]);
  const indexPath = path.join(repo, ".git", "index");
  const status = git(repo, ["status", "--porcelain"]);
  const index = readFileSync(indexPath);
  ok(repo);
  assert.equal(git(repo, ["status", "--porcelain"]), status);
  assert.ok(readFileSync(indexPath).equals(index));
});

test("no first commit: exit 3 and empty stdout", { skip }, () => {
  const r = fingerprint(makeRepo(false));
  assert.equal(r.status, 3);
  assert.equal(r.out, "");
});

test("not a git repository: exit 2 and empty stdout", { skip }, () => {
  const r = fingerprint(tmp());
  assert.equal(r.status, 2);
  assert.equal(r.out, "");
});
