// `issuekit framework-fix`: start, the commit half and the publish half of submit, driven through
// stand-in git/exec runners that record their calls. Two tests at the end use a real temp git repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  NOT_BOUND,
  frameworkFixCommit,
  frameworkFixPublish,
  frameworkFixStart,
  frameworkFixSubmit,
  parseSubmitArgs,
} from "./issuekit-framework.js";

const NAME_HIT = "name check: a project name was found";
const PR_URL = "https://github.com/alpha/zebrafish/pull/7";

/**
 * @typedef {{
 *   branch?: string | null, bound?: boolean, staged?: string, remotes?: string, url?: string,
 *   prList?: { status: number, out: string, err?: string }, nameHit?: string,
 *   porcelain?: string, tree?: string, log?: string,
 *   push?: { status: number, out: string, err?: string },
 *   create?: { status: number, out: string, err?: string },
 * }} Setup
 */

/** Stand-in git and exec runners over a recorded call list.
 * @param {Setup} [setup] */
function fakes(setup = {}) {
  const {
    branch = "main",
    bound = true,
    staged = "",
    remotes = "origin\n",
    url = "https://github.com/alpha/zebrafish.git",
    prList = { status: 0, out: "[]" },
    nameHit = "",
    porcelain = "",
    tree = "",
    log = "abc123\nfix the thing\n\0",
    push = { status: 0, out: "" },
    create = { status: 0, out: `${PR_URL}\n` },
  } = setup;
  /** @type {string[][]} */
  const gitCalls = [];
  /** @type {{ cmd: string, args: string[], input?: string }[]} */
  const execCalls = [];
  /** @type {import("./issuekit-framework.js").FixDeps} */
  const deps = {
    bound: () => bound,
    git: (_dir, args) => {
      gitCalls.push(args);
      const [a0, a1] = args;
      if (a0 === "symbolic-ref") return { status: branch ? 0 : 1, stdout: `${branch ?? ""}\n` };
      if (a0 === "diff" && a1 === "--cached") return { status: 0, stdout: staged };
      if (a0 === "remote" && a1 === "get-url") return { status: 0, stdout: `${url}\n` };
      if (a0 === "remote") return { status: 0, stdout: remotes };
      if (a0 === "rev-parse" && a1 === "--verify") return { status: 1, stdout: "" };
      if (a0 === "rev-parse") return { status: 0, stdout: "1234567890abcdef\n" };
      if (a0 === "status") return { status: 0, stdout: porcelain };
      if (a0 === "diff-tree") return { status: 0, stdout: tree };
      if (a0 === "log") return { status: 0, stdout: log };
      return { status: 0, stdout: "" };
    },
    exec: (cmd, args, opts) => {
      execCalls.push({ cmd, args, input: opts?.input });
      if (cmd === process.execPath) {
        const hit = nameHit !== "" && (opts?.input ?? "").includes(nameHit);
        return hit ? { status: 1, out: "", err: NAME_HIT } : { status: 0, out: "", err: "" };
      }
      if (cmd === "gh" && args[1] === "list") return { err: "", ...prList };
      if (cmd === "gh" && args[1] === "create") return { err: "", ...create };
      if (cmd === "git" && args[0] === "push") return { err: "", ...push };
      return { status: 0, out: "", err: "" };
    },
  };
  /** @param {string} cmd @param {string} first */
  const execOf = (cmd, first) => execCalls.filter((c) => c.cmd === cmd && c.args[0] === first);
  return { deps, gitCalls, execCalls, execOf };
}

/** A temp checkout folder with real files, removed when the test ends.
 * @param {import("node:test").TestContext} t @param {string[]} files */
function checkout(t, files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "fw-fix-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  mkdirSync(path.join(dir, "sub"));
  for (const f of files) writeFileSync(path.join(dir, f), "x\n");
  return dir;
}

/** @param {Record<string, unknown>} r @returns {string} */
const refusalOf = (r) => {
  assert.equal(r.ok, false, "expected a refusal");
  return String(r.refusal);
};

const FIX = { branch: "fix/alpha-bug" };

test("start: on a clean bound main it creates fix/<slug> and names the submit command", () => {
  const f = fakes();
  const r = frameworkFixStart("/fw", "Alpha bug", f.deps);
  assert.equal(r.ok, true);
  assert.deepEqual(
    f.gitCalls.filter((c) => c[0] === "switch"),
    [["switch", "-c", "fix/alpha-bug"]],
  );
  assert.match(String(r.ok && r.line), /issuekit framework-fix submit --files/);
});

test("start: off main it names the branch, the open PR number and address; a gh failure says unreadable", () => {
  const open = fakes({
    branch: "fix/beta",
    prList: { status: 0, out: JSON.stringify([{ number: 7, url: PR_URL }]) },
  });
  const a = refusalOf(frameworkFixStart("/fw", "x", open.deps));
  assert.match(a, /fix\/beta/);
  assert.match(a, /#7/);
  assert.ok(a.includes(PR_URL));
  const broken = fakes({ branch: "fix/beta", prList: { status: 1, out: "", err: "no network" } });
  const b = refusalOf(frameworkFixStart("/fw", "x", broken.deps));
  assert.match(b, /fix\/beta/);
  assert.match(b, /PR could not be read/);
  assert.equal(open.gitCalls.filter((c) => c[0] === "switch").length, 0);
});

test("start: a project name in the slug is refused and no branch is created", () => {
  const f = fakes({ nameHit: "zebrafish" });
  const msg = refusalOf(frameworkFixStart("/fw", "zebrafish crash", f.deps));
  assert.equal(msg, NAME_HIT);
  assert.equal(f.gitCalls.filter((c) => c[0] === "switch").length, 0);
});

test("a project name in the current branch name is refused before any gh call: start and submit", () => {
  const branch = { branch: "fix/zebrafish-crash", nameHit: "zebrafish" };
  const s = fakes(branch);
  assert.equal(refusalOf(frameworkFixStart("/fw", "x", s.deps)), NAME_HIT);
  assert.equal(s.execCalls.filter((c) => c.cmd === "gh").length, 0);
  const p = fakes(branch);
  const msg = refusalOf(frameworkFixSubmit("/fw", { files: [], title: "t", body: "b" }, p.deps));
  assert.match(msg, new RegExp(`^${NAME_HIT}\nnothing was committed or pushed`));
  assert.equal(p.execCalls.filter((c) => c.cmd === "gh").length, 0);
  assert.equal(p.execOf("git", "push").length, 0);
});

test("start: staged files on main are refused; an unbound checkout gets the runs-no-projects text", () => {
  const staged = fakes({ staged: "a.js\0" });
  const a = refusalOf(frameworkFixStart("/fw", "x", staged.deps));
  assert.match(a, /staged changes \(a\.js\)/);
  assert.equal(staged.gitCalls.filter((c) => c[0] === "switch").length, 0);
  const unbound = fakes({ bound: false });
  assert.equal(refusalOf(frameworkFixStart("/fw", "x", unbound.deps)), NOT_BOUND);
  assert.match(NOT_BOUND, /runs no projects/);
});

test("commit: stages exactly the named files, commits with the message, never --no-verify", (t) => {
  const dir = checkout(t, ["a.txt", "b.txt"]);
  const f = fakes({ ...FIX, tree: "a.txt\0b.txt\0" });
  const r = frameworkFixCommit(dir, { files: ["a.txt", "./b.txt"], message: "fix it" }, f.deps);
  assert.equal(r.ok, true);
  const adds = f.execOf("git", "add");
  assert.deepEqual(
    adds.map((c) => c.args),
    [["add", "--", "a.txt", "b.txt"]],
  );
  assert.deepEqual(
    f.execOf("git", "commit").map((c) => c.args),
    [["commit", "-m", "fix it"]],
  );
  assert.ok(!f.execCalls.some((c) => c.args.includes("--no-verify")));
});

test("commit: something already staged is refused before any git add", (t) => {
  const dir = checkout(t, ["a.txt"]);
  const f = fakes({ ...FIX, staged: "other.txt\0" });
  const msg = refusalOf(frameworkFixCommit(dir, { files: ["a.txt"], message: "m" }, f.deps));
  assert.match(msg, /already staged \(other\.txt\)/);
  assert.equal(f.execOf("git", "add").length, 0);
});

test("commit: a commit holding an unnamed file is taken back; hook-staged files are accepted", (t) => {
  const dir = checkout(t, ["a.txt"]);
  const bad = fakes({ ...FIX, tree: "a.txt\0stray.txt\0" });
  const msg = refusalOf(frameworkFixCommit(dir, { files: ["a.txt"], message: "m" }, bad.deps));
  assert.match(msg, /stray\.txt/);
  assert.ok(bad.gitCalls.some((c) => c.join(" ") === "reset --soft HEAD~1"));
  const good = fakes({ ...FIX, tree: "a.txt\0README.md\0FEATURES.md\0" });
  const r = frameworkFixCommit(dir, { files: ["a.txt"], message: "m" }, good.deps);
  assert.equal(r.ok, true);
  assert.ok(!good.gitCalls.some((c) => c[0] === "reset" && c[1] === "--soft"));
});

test("commit: a hook-staged file with local changes that is not named is refused before the commit", (t) => {
  const dir = checkout(t, ["a.txt", "README.md"]);
  const f = fakes({ ...FIX, porcelain: " M README.md\0", tree: "a.txt\0" });
  const msg = refusalOf(frameworkFixCommit(dir, { files: ["a.txt"], message: "m" }, f.deps));
  assert.match(msg, /README\.md has local changes/);
  assert.equal(f.execOf("git", "add").length, 0);
  assert.equal(f.execOf("git", "commit").length, 0);
  const named = fakes({ ...FIX, porcelain: " M README.md\0", tree: "a.txt\0README.md\0" });
  const ok = frameworkFixCommit(dir, { files: ["a.txt", "README.md"], message: "m" }, named.deps);
  assert.equal(ok.ok, true);
});

test("commit: bad arguments are each refused and nothing is added or committed", (t) => {
  const dir = checkout(t, ["a.txt"]);
  /** @type {[string, { files: string[], message?: string }, RegExp][]} */
  const table = [
    ["no message", { files: ["a.txt"] }, /needs -m/],
    ["no files", { files: [], message: "m" }, /needs --files/],
    ["outside the checkout", { files: ["../escape.txt"], message: "m" }, /outside the framework/],
    ["a folder", { files: ["sub"], message: "m" }, /a folder/],
    ["missing file", { files: ["gone.txt"], message: "m" }, /does not exist/],
  ];
  for (const [label, args, re] of table) {
    const f = fakes(FIX);
    const msg = refusalOf(frameworkFixCommit(dir, args, f.deps));
    assert.match(msg, re, label);
    assert.equal(f.execOf("git", "add").length + f.execOf("git", "commit").length, 0, label);
  }
});

test("publish: a name in the title is refused with no push and no pr create", () => {
  const f = fakes({ nameHit: "zebrafish-title" });
  const plan = { remote: "origin", repo: "alpha/zebrafish", branch: "fix/x", pr: null };
  const msg = refusalOf(
    frameworkFixPublish("/fw", plan, { files: [], title: "zebrafish-title", body: "b" }, f.deps),
  );
  assert.match(msg, new RegExp(NAME_HIT));
  assert.match(msg, /nothing was pushed/);
  assert.equal(f.execOf("git", "push").length, 0);
  assert.equal(f.execOf("gh", "pr").filter((c) => c.args[1] === "create").length, 0);
});

test("publish: pushes to the frameworkRemote and the branch, never main; odd branch names are refused first", () => {
  const f = fakes({
    branch: "fix/x",
    remotes: "origin\nxenomoon\n",
    url: "git@github.com:alpha/zebrafish.git",
  });
  const r = frameworkFixSubmit("/fw", { files: [], title: "t", body: "b" }, f.deps);
  assert.equal(r.ok, true);
  assert.deepEqual(
    f.execOf("git", "push").map((c) => c.args),
    [["push", "-u", "xenomoon", "fix/x"]],
  );
  for (const odd of ["fix/a:b", "+fix/x", "refs/heads/x", "main"]) {
    const g = fakes({ branch: odd });
    const msg = refusalOf(frameworkFixSubmit("/fw", { files: [], title: "t", body: "b" }, g.deps));
    assert.ok(msg.length > 0, odd);
    assert.equal(g.execOf("git", "push").length, 0, odd);
  }
});

test("publish: pr create gets repo, base, head, label, title, body; an open PR means no create", () => {
  const f = fakes({ branch: "fix/x" });
  const r = frameworkFixSubmit("/fw", { files: [], title: "The title", body: "The body" }, f.deps);
  assert.equal(r.ok, true);
  const creates = f.execOf("gh", "pr").filter((c) => c.args[1] === "create");
  assert.deepEqual(
    creates.map((c) => c.args),
    [
      ["pr", "create", "-R", "alpha/zebrafish", "--base", "main", "--head", "fix/x"].concat([
        "--title",
        "The title",
        "--body",
        "The body",
        "--label",
        "spine",
      ]),
    ],
  );
  const open = fakes({
    branch: "fix/x",
    prList: { status: 0, out: JSON.stringify([{ number: 7, url: PR_URL }]) },
  });
  const u = frameworkFixSubmit("/fw", { files: [] }, open.deps);
  assert.equal(u.ok, true);
  assert.equal(open.execOf("gh", "pr").filter((c) => c.args[1] === "create").length, 0);
  assert.match(String(u.ok && u.lines.join("\n")), /was updated by the push/);
});

test("publish: a failed pr create after the push says so and the retry commits nothing", (t) => {
  const dir = checkout(t, ["a.txt"]);
  const f = fakes({
    branch: "fix/x",
    tree: "a.txt\0",
    create: { status: 1, out: "", err: "gh: rate limited" },
  });
  const args = { files: ["a.txt"], message: "m", title: "T", body: "B" };
  const msg = refusalOf(frameworkFixSubmit(dir, args, f.deps));
  assert.match(msg, /pushed fix\/x to origin, but gh pr create failed/);
  assert.match(msg, /retry: issuekit framework-fix submit --title "T" --body "B"/);
  assert.equal(f.execOf("git", "push").length, 1);

  const again = fakes({ branch: "fix/x" });
  const r = frameworkFixSubmit(dir, parseSubmitArgs(["--title", "T", "--body", "B"]), again.deps);
  assert.equal(r.ok, true);
  assert.equal(again.execOf("git", "commit").length + again.execOf("git", "add").length, 0);
  assert.equal(again.execOf("gh", "pr").filter((c) => c.args[1] === "create").length, 1);
});

test("parseSubmitArgs: repeated --files and a comma list give every path", () => {
  const a = parseSubmitArgs([
    "--files",
    "a.js,b.js",
    "--files",
    "c.js",
    "-m",
    "msg",
    "--title",
    "T",
  ]);
  assert.deepEqual(a.files, ["a.js", "b.js", "c.js"]);
  assert.equal(a.message, "msg");
  assert.equal(a.title, "T");
});

/** A real repo on a fix branch, with an origin remote and a bound stand-in.
 * @param {import("node:test").TestContext} t */
function realRepo(t) {
  const dir = checkout(t, ["a.txt", "b.txt"]);
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@example.invalid",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@example.invalid",
  };
  const saved = { ...process.env };
  Object.assign(process.env, env);
  t.after(() => {
    for (const k of Object.keys(env)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  /** @param {string[]} a */
  const g = (a) => {
    const r = spawnSync("git", ["-C", dir, ...a], { encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  g(["init", "-q", "-b", "main"]);
  g(["add", "."]);
  g(["commit", "-q", "-m", "base"]);
  g(["switch", "-q", "-c", "fix/real"]);
  writeFileSync(path.join(dir, "a.txt"), "changed a\n");
  writeFileSync(path.join(dir, "b.txt"), "changed b\n");
  return { dir, g };
}

test("real git: only the named file is committed; the unnamed change stays unstaged", (t) => {
  const { dir, g } = realRepo(t);
  const r = frameworkFixCommit(dir, { files: ["a.txt"], message: "fix a" }, { bound: () => true });
  assert.equal(r.ok, true);
  assert.equal(g(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]).trim(), "a.txt");
  assert.equal(g(["diff", "--cached", "--name-only"]), "");
  assert.match(readFileSync(path.join(dir, "b.txt"), "utf8"), /changed b/);
});

test("real git: a hook that stages an extra file gets the commit taken back, changes kept", (t) => {
  const { dir, g } = realRepo(t);
  const hook = path.join(dir, ".git", "hooks", "pre-commit");
  writeFileSync(hook, "#!/bin/sh\ngit add b.txt\n");
  chmodSync(hook, 0o755);
  const before = g(["rev-parse", "HEAD"]);
  const msg = refusalOf(
    frameworkFixCommit(dir, { files: ["a.txt"], message: "fix a" }, { bound: () => true }),
  );
  assert.match(msg, /b\.txt/);
  assert.equal(g(["rev-parse", "HEAD"]), before);
  assert.equal(g(["diff", "--cached", "--name-only"]), "");
  assert.match(readFileSync(path.join(dir, "b.txt"), "utf8"), /changed b/);
});
