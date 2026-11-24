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

/** Run the real check with stdin. @param {string[]} args @param {NodeJS.ProcessEnv} env
 * @param {string} [input] */
function check(args, env, input = "") {
  const r = spawnSync("node", [CHECK, ...args], { env, encoding: "utf8", input });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** One empty commit with a message; returns its full sha. @param {string} repo
 * @param {string[]} messages one `-m` each (subject, then body) */
function commitMessage(repo, messages) {
  git(repo, [
    "commit",
    "-q",
    "--allow-empty",
    "--no-verify",
    ...messages.flatMap((m) => ["-m", m]),
  ]);
  return git(repo, ["rev-parse", "HEAD"]).out.trim();
}

/** The pre-push hook's stdin line. @param {string} local @param {string} remote */
const pushLine = (local, remote) => `refs/heads/main ${local} refs/heads/main ${remote}\n`;

test("99: push mode refuses a name in a commit SUBJECT and names the commit", () => {
  const repo = freshRepo();
  const base = git(repo, ["rev-parse", "HEAD"]).out.trim();
  const head = commitMessage(repo, [`roadmap for ${TERM}`]);
  const short = git(repo, ["rev-parse", "--short", head]).out.trim();
  const r = check(["--push", "--repo", repo], envWith(TERM), pushLine(head, base));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, new RegExp(`commit ${short} \\(in the message\\)`));
  assert.match(r.out, /"acme-fake"/);
});

test("99: push mode refuses a name in a commit BODY, not only the subject", () => {
  const repo = freshRepo();
  const base = git(repo, ["rev-parse", "HEAD"]).out.trim();
  const head = commitMessage(repo, ["neutral subject", `body line\nmore for ${TERM}`]);
  const short = git(repo, ["rev-parse", "--short", head]).out.trim();
  const r = check(["--push", "--repo", repo], envWith(TERM), pushLine(head, base));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, new RegExp(`commit ${short} \\(in the message\\)`));
});

test("99: a control byte in a message does not hide a later name from push mode", () => {
  for (const byte of ["\x1f", "\x1e"]) {
    const repo = freshRepo();
    const base = git(repo, ["rev-parse", "HEAD"]).out.trim();
    const head = commitMessage(repo, [`neutral ${byte} subject`, `body for ${TERM}`]);
    const r = check(["--push", "--repo", repo], envWith(TERM), pushLine(head, base));
    assert.equal(r.status, 1, `byte ${byte.charCodeAt(0)}: ${r.out}`);
    assert.match(r.out, /"acme-fake"/);
  }
});

test("99: push mode does not scan a commit the remote already has; a clean message passes", () => {
  const repo = freshRepo();
  const leaky = commitMessage(repo, [`for ${TERM}`]);
  const clean = commitMessage(repo, ["neutral subject"]);
  const onRemote = check(["--push", "--repo", repo], envWith(TERM), pushLine(clean, leaky));
  assert.equal(onRemote.status, 0, `the leaky commit is the remote's tip: ${onRemote.out}`);
  assert.match(onRemote.out, /^ok /);
  const base = git(repo, ["rev-parse", "HEAD~2"]).out.trim();
  const all = check(["--push", "--repo", repo], envWith(TERM), pushLine(clean, base));
  assert.equal(all.status, 1, "the same range from before the leaky commit is refused");
});

/** A registry with one install whose `projects` map is `projects`. @param {Record<string, unknown>} projects
 * @returns {NodeJS.ProcessEnv} */
function registryWith(projects) {
  const install = mkdtempSync(path.join(scratch, "install-"));
  writeFileSync(path.join(install, ".xenomoon.json"), JSON.stringify({ projects }));
  const registry = path.join(scratch, `${path.basename(install)}.json`);
  writeFileSync(registry, JSON.stringify({ installs: { [install]: null } }));
  return { ...envWith(""), XENOMOON_REGISTRY: registry };
}

test("99: a distinctive projects-map key is a term in tree mode; generic keys are not", () => {
  const repo = freshRepo();
  mkdirSync(path.join(repo, "ui"));
  const file = path.join(repo, "ui", "a.js");
  const env = registryWith({
    zebrafish: { dir: "/ws/folder-one" },
    staging: { dir: "/ws/folder-two" },
    build: { dir: "/ws/folder-three" },
    production: { dir: "/ws/folder-four" },
  });
  writeFileSync(file, "// deploy to staging, build production\n");
  git(repo, ["add", "-A"]);
  const clean = check(["--repo", repo], env);
  assert.equal(clean.status, 0, `generic keys never accuse: ${clean.out}`);
  assert.match(clean.out, /none of 5 known/, "zebrafish and the 4 folders, no generic key");
  writeFileSync(file, "// the zebrafish roadmap\n");
  git(repo, ["add", "-A"]);
  const leak = check(["--repo", repo], env);
  assert.equal(leak.status, 1, leak.out);
  assert.match(leak.out, /ui\/a\.js:1 — "zebrafish"/);
});

test("99: --text refuses a name with its line number and the advice", () => {
  const r = check(["--text"], envWith(TERM), `first line\nbuilt for ${TERM}\n`);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /stdin:2 — "acme-fake"/);
  assert.match(r.out, /Replace the name with a neutral word/);
});

test("99: --text passes clean text, and text holding only a generic alias", () => {
  assert.equal(check(["--text"], envWith(TERM), "a neutral branch name\n").status, 0);
  const env = registryWith({ staging: { dir: "/ws/zebrafish-shop" } });
  const r = check(["--text"], env, "deploy to staging and build\n");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /none of 1 known/, "the alias is dropped, the folder name is the one term");
  assert.equal(check(["--text"], env, "for zebrafish-shop\n").status, 1, "the folder still bites");
});

test("99: --require-terms with an empty term list fails in --text mode", (t) => {
  if (bound) {
    t.skip("this checkout is bound to a project, so its term list is never empty");
    return;
  }
  const r = check(["--text", "--require-terms"], envWith(""), "anything\n");
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /--require-terms: the term list is EMPTY/);
  assert.equal(
    check(["--text"], envWith(""), "anything\n").status,
    0,
    "without the flag it passes",
  );
});
