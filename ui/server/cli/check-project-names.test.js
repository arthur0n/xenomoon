// End-to-end: a planted name is blocked at commit (1c), at push (1d) and in CI (1e).
// Each test builds a throwaway git repo and drives the REAL check script the hooks and the
// workflow call. The planted term is obviously fake; the env points the loader at an empty
// file and a missing registry, so a real local denylist never takes part.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..", "..", "..");
const CHECK = path.join(here, "check-project-names.js");
const CONTAMINATION = path.join(here, "gen-contamination.js");
const TERM = "acme-fake";

const scratch = mkdtempSync(path.join(tmpdir(), "name-gate-"));
const emptyList = path.join(scratch, "empty-denylist.txt");
writeFileSync(emptyList, "# no terms\n");

/** An env with only the terms a test gives it. @param {string} terms @returns {NodeJS.ProcessEnv} */
function envWith(terms) {
  return {
    ...process.env,
    XENOMOON_DENYLIST: emptyList,
    XENOMOON_REGISTRY: path.join(scratch, "no-registry.json"),
    XENOMOON_DENYLIST_TERMS: terms,
  };
}

/** @param {string} cwd @param {string[]} args @param {NodeJS.ProcessEnv} [env] */
function git(cwd, args, env = process.env) {
  const r = spawnSync(
    "git",
    [
      "-c",
      "commit.gpgsign=false",
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.invalid",
      ...args,
    ],
    { cwd, env, encoding: "utf8" },
  );
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** A fresh repo with one clean commit. @returns {string} */
function freshRepo() {
  const dir = mkdtempSync(path.join(scratch, "repo-"));
  git(dir, ["init", "-q", "-b", "main"]);
  writeFileSync(path.join(dir, "notes.md"), "clean\n");
  git(dir, ["add", "notes.md"]);
  git(dir, ["commit", "-q", "--no-verify", "-m", "init"]);
  return dir;
}

/** Install a git hook that runs the real check exactly as .husky does. @param {string} repo
 * @param {string} name @param {string} flag */
function hook(repo, name, flag) {
  const dir = path.join(repo, ".hooks");
  mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name);
  writeFileSync(f, `#!/bin/sh\nexec node "${CHECK}" ${flag} --repo .\n`);
  chmodSync(f, 0o755);
  git(repo, ["config", "core.hooksPath", ".hooks"]);
}

/** Whether this checkout is bound to a project (its name would make the term list non-empty). */
const bound = (() => {
  try {
    const f = path.join(ROOT, ".xenomoon.json");
    if (!existsSync(f)) return false;
    const cfg = /** @type {{ projectDir?: unknown }} */ (parseJSON(readFileSync(f, "utf8")));
    return Boolean(cfg.projectDir);
  } catch {
    return false;
  }
})();

test("1c: a staged file holding a denylisted term blocks the commit", () => {
  const repo = freshRepo();
  hook(repo, "pre-commit", "--staged");
  writeFileSync(path.join(repo, "notes.md"), "clean\nbuilt for ACME-FAKE\n");
  git(repo, ["add", "notes.md"]);
  const r = git(repo, ["commit", "-q", "-m", "leak"], envWith(TERM));
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /notes\.md — "acme-fake"/);
  assert.equal(git(repo, ["rev-list", "--count", "HEAD"]).out.trim(), "1", "nothing committed");

  const ok = git(repo, ["commit", "-q", "-m", "fine"], envWith("globex-fake"));
  assert.equal(ok.status, 0, `another term does not block: ${ok.out}`);
});

test("1c: a file NAMED after a term is blocked even when empty", () => {
  const repo = freshRepo();
  writeFileSync(path.join(repo, `${TERM}.md`), "");
  git(repo, ["add", "-A"]);
  const r = spawnSync("node", [CHECK, "--staged", "--repo", repo], {
    env: envWith(TERM),
    encoding: "utf8",
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
});

test("1c: pre-commit fails when gitleaks is missing instead of skipping", (t) => {
  if (existsSync("/usr/bin/gitleaks") || existsSync("/bin/gitleaks")) {
    t.skip("gitleaks is on the minimal PATH");
    return;
  }
  const r = spawnSync("sh", [path.join(ROOT, ".husky", "pre-commit")], {
    cwd: scratch, // it exits at the gitleaks check, before any repo-touching step
    env: { ...process.env, PATH: "/usr/bin:/bin" },
    encoding: "utf8",
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /gitleaks is not installed/);
});

test("1d: a pushed commit holding a term is refused; a clean one goes through", () => {
  const remote = mkdtempSync(path.join(scratch, "remote-"));
  git(remote, ["init", "-q", "--bare"]);
  const repo = freshRepo();
  git(repo, ["remote", "add", "origin", remote]);
  hook(repo, "pre-push", "--push");
  assert.equal(git(repo, ["push", "-q", "origin", "main"], envWith(TERM)).status, 0);

  // The term lands in a middle commit and is removed again: the working tree is clean, but
  // the history being pushed is not.
  writeFileSync(path.join(repo, "notes.md"), "clean\nacme-fake roadmap\n");
  git(repo, ["commit", "-q", "--no-verify", "-am", "leak"]);
  writeFileSync(path.join(repo, "notes.md"), "clean\n");
  git(repo, ["commit", "-q", "--no-verify", "-am", "hide"]);
  const r = git(repo, ["push", "-q", "origin", "main"], envWith(TERM));
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /pushed commits/);
  assert.match(r.out, /"acme-fake"/);

  const branch = git(repo, ["push", "-q", "origin", "main:fresh"], envWith(TERM));
  assert.notEqual(branch.status, 0, `a NEW remote branch is scanned too: ${branch.out}`);

  git(repo, ["reset", "-q", "--hard", "HEAD~2"]);
  writeFileSync(path.join(repo, "notes.md"), "clean\nmore\n");
  git(repo, ["commit", "-q", "--no-verify", "-am", "ok"]);
  const ok = git(repo, ["push", "-q", "origin", "main"], envWith(TERM));
  assert.equal(ok.status, 0, ok.out);
});

test("1e: --require-terms fails on an empty list, passes a clean tree with terms", (t) => {
  if (bound) {
    t.skip("this checkout is bound to a project, so its term list is never empty");
    return;
  }
  const repo = freshRepo();
  for (const script of [CHECK, CONTAMINATION]) {
    const extra = script === CHECK ? ["--repo", repo] : [];
    const empty = spawnSync("node", [script, "--require-terms", ...extra], {
      env: envWith(""),
      encoding: "utf8",
    });
    assert.equal(empty.status, 1, `${path.basename(script)} with no terms must fail`);
    assert.match(empty.stderr, /--require-terms: the term list is EMPTY/);
    const set = spawnSync("node", [script, "--require-terms", ...extra], {
      env: envWith("zz-not-a-real-name-fake"),
      encoding: "utf8",
    });
    assert.equal(set.status, 0, `${path.basename(script)}: ${set.stdout}${set.stderr}`);
  }
});

test("1e: a planted term in tracked source fails the CI check", () => {
  const repo = freshRepo();
  mkdirSync(path.join(repo, "ui"));
  writeFileSync(path.join(repo, "ui", "a.js"), `// for ${TERM}\n`);
  git(repo, ["add", "-A"]);
  const r = spawnSync("node", [CHECK, "--require-terms", "--repo", repo], {
    env: envWith(TERM),
    encoding: "utf8",
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /ui\/a\.js:1 — "acme-fake"/);
});

test("the hooks and the workflow actually call these modes", () => {
  const pre = readFileSync(path.join(ROOT, ".husky", "pre-commit"), "utf8");
  const push = readFileSync(path.join(ROOT, ".husky", "pre-push"), "utf8");
  const ci = readFileSync(path.join(ROOT, ".github", "workflows", "pr-domain.yml"), "utf8");
  assert.match(pre, /check-project-names\.js --staged/);
  assert.match(push, /check-project-names\.js --push/);
  assert.ok(push.indexOf("xenodot-forge") < push.indexOf("--push"), "xenodot block stays first");
  assert.match(ci, /check:contamination -- --require-terms/);
  assert.match(ci, /check:project-names -- --require-terms/);
  assert.match(ci, /XENOMOON_DENYLIST_TERMS: \$\{\{ secrets\.XENOMOON_DENYLIST_TERMS \}\}/);
  assert.match(ci, /node-version: 24/);
});
