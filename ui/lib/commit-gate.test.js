// The commit gate (plugin/hooks/commit-gate.sh) run as a real process against made-up issues. A
// temp git repo gives it a HEAD, and a `gh` stand-in first on PATH prints a fixture file, so the
// real gh is never called. The hook is only spawned, never imported.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { setFlow } from "../server/features/tasks/flow-task.js";
import { parseJSON } from "./json.js";

const HOOKS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "plugin",
  "hooks",
);
const HOOK = path.join(HOOKS, "commit-gate.sh");
const ISSUE_CLI = path.join(HOOKS, "..", "..", "ui", "server", "cli", "issuekit.js");

/** @param {string} bin */
const has = (bin) => spawnSync(bin, ["--version"]).status === 0;
const missing = ["jq", "git", "bash"].filter((b) => !has(b));
const skip = missing.length > 0 && `${missing.join(", ")} not on PATH`;

/** @type {string} */ let root = "";
/** @type {string} */ let repo = "";
/** @type {string} */ let fixture = "";
/** @type {string} */ let head = "";
/** @type {string} */ let content = "";
/** @type {NodeJS.ProcessEnv} */ let env = {};

/** The child environment: a copy of ours without any inherited GIT_* key. */
function childEnv(/** @type {string} */ binDir) {
  /** @type {NodeJS.ProcessEnv} */
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (k.startsWith("GIT_")) delete e[k];
  e["PATH"] = `${binDir}${path.delimiter}${process.env["PATH"] ?? ""}`;
  return e;
}

before(() => {
  if (skip) return;
  root = mkdtempSync(path.join(os.tmpdir(), "commit-gate-"));
  repo = path.join(root, "repo");
  const bin = path.join(root, "bin");
  fixture = path.join(root, "issue.json");
  const e = childEnv(bin);
  for (const args of [
    ["init", "-q", "-b", "main", repo],
    ["-C", repo, "config", "user.name", "t"],
    ["-C", repo, "config", "user.email", "t@example.com"],
    ["-C", repo, "config", "commit.gpgsign", "false"],
    ["-C", repo, "commit", "-q", "--allow-empty", "-m", "init"],
  ]) {
    const r = spawnSync("git", args, { env: e, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  }
  head = spawnSync("git", ["-C", repo, "rev-parse", "HEAD"], {
    env: e,
    encoding: "utf8",
  }).stdout.trim();
  assert.match(head, /^[0-9a-f]{40}$/);
  // Content the commit records, staged: what an allowed commit looks like.
  writeFileSync(path.join(repo, "a.txt"), "a\n");
  assert.equal(spawnSync("git", ["-C", repo, "add", "a.txt"], { env: e }).status, 0);
  content = contentOf(repo, e);
  mkdirSync(bin);
  const gh = path.join(bin, "gh");
  writeFileSync(gh, `#!/bin/sh\ncat "${fixture}"\n`);
  chmodSync(gh, 0o755);
  env = e;
});

after(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

/** The content id of `dir`, computed by the real tree-fingerprint.sh.
 * @param {string} dir @param {NodeJS.ProcessEnv} [e] */
function contentOf(dir, e = env) {
  const r = spawnSync("bash", [path.join(HOOKS, "tree-fingerprint.sh"), dir], {
    env: e,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  const id = r.stdout.trim();
  assert.match(id, /^[0-9a-f]{40}$/);
  return id;
}

/** Write the fixture (null = the stand-in prints nothing) and run the hook on `command`. `dir` is the
 * hook's working folder, `payloadCwd` the `cwd` of the payload (none by default).
 * @param {{ labels?: string[], comments?: string[] } | null} issue @param {string} command
 * @param {{ dir?: string, payloadCwd?: string }} [opts] */
function gate(issue, command = 'git commit -m "x (#5)"', opts = {}) {
  writeFileSync(
    fixture,
    issue === null
      ? ""
      : JSON.stringify({
          labels: (issue.labels ?? []).map((name) => ({ name })),
          comments: (issue.comments ?? []).map((body) => ({ body })),
        }),
  );
  const r = spawnSync("bash", [HOOK], {
    input: JSON.stringify({ tool_input: { command }, cwd: opts.payloadCwd }),
    cwd: opts.dir ?? repo,
    env,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  const out =
    /** @type {{ hookSpecificOutput: { permissionDecision: string, permissionDecisionReason: string } }} */ (
      parseJSON(r.stdout)
    ).hookSpecificOutput;
  return { decision: out.permissionDecision, reason: out.permissionDecisionReason };
}

/** @param {string} sha */
/** @param {string} sha @param {string} [id] the content mark (default: the test repo's content) */
const qaPass = (sha, id = content) =>
  `## 🧪 QA — PASS\n\nall green\n\nqa-verified: ${sha}\nqa-content: ${id}`;
/** @param {string} sha @param {string} [id] the content mark (default: the test repo's content) */
const reviewPass = (sha, id = content) =>
  `## 🔎 REVIEW — pass\n\nlooks right\n\nreview-verified: ${sha}\nreview-content: ${id}`;
const PRE_PR = "## 🚦 PRE-PR — not-ready\n\nnot ready\n\n*pre-PR review · senior-analyst*";
const GREEN = ["qa:pass", "review:pass"];

test("commit-gate: QA pass and review pass at HEAD allow", { skip }, () => {
  const r = gate({ labels: GREEN, comments: [qaPass(head), reviewPass(head)] });
  assert.equal(r.decision, "allow");
  assert.match(r.reason, /Gate green for #5/);
});

test("commit-gate: an older PRE-PR not-ready comment no longer vetoes", { skip }, () => {
  const r = gate({ labels: GREEN, comments: [PRE_PR, qaPass(head), reviewPass(head)] });
  assert.equal(r.decision, "allow");
  assert.match(r.reason, /Gate green for #5/);
});

test(
  "commit-gate: only a PRE-PR comment still counts as pipeline state and denies",
  { skip },
  () => {
    const r = gate({ comments: [PRE_PR] });
    assert.equal(r.decision, "deny");
    assert.match(r.reason, /lacks qa:pass/);
  },
);

test("commit-gate: a newest QA verdict of blocked denies", { skip }, () => {
  const r = gate({
    labels: GREEN,
    comments: [qaPass(head), reviewPass(head), "## 🧪 QA — blocked\n\nbroken"],
  });
  assert.equal(r.decision, "deny");
  assert.match(r.reason, /NEWEST QA verdict on #5 is BLOCKED/);
});

test("commit-gate: a review-verified sha that is not HEAD denies", { skip }, () => {
  const other = "a".repeat(40);
  assert.notEqual(other, head);
  const r = gate({ labels: GREEN, comments: [qaPass(head), reviewPass(other)] });
  assert.equal(r.decision, "deny");
  assert.match(r.reason, /review verified #5 at aaaaaaa/);
});

test("commit-gate: a commit message with no (#N) asks", { skip }, () => {
  const r = gate({ labels: GREEN }, 'git commit -m "no issue here"');
  assert.equal(r.decision, "ask");
  assert.match(r.reason, /No \(#N\) issue reference/);
});

test("commit-gate: an unreadable issue asks", { skip }, () => {
  const r = gate(null);
  assert.equal(r.decision, "ask");
  assert.match(r.reason, /could not be read/);
});

// --- #110: the pass is bound to the content ---------------------------------------------------

/** A fresh repo like the shared one: one empty commit, a.txt staged. Its head and content id are returned.
 * @param {string} label */
function newRepo(label) {
  const dir = path.join(root, label);
  for (const args of [
    ["init", "-q", "-b", "main", dir],
    ["-C", dir, "config", "user.name", "t"],
    ["-C", dir, "config", "user.email", "t@example.test"],
    ["-C", dir, "config", "commit.gpgsign", "false"],
    ["-C", dir, "commit", "-q", "--allow-empty", "-m", label],
  ]) {
    const r = spawnSync("git", args, { env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  }
  writeFileSync(path.join(dir, "a.txt"), `${label}\n`);
  git(dir, "add", "a.txt");
  const sha = git(dir, "rev-parse", "HEAD");
  return { dir, sha, id: contentOf(dir) };
}

/** @param {string} dir @param {...string} args */
function git(dir, ...args) {
  const r = spawnSync("git", ["-C", dir, ...args], { env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

/** A repo whose folder is also a project with an open flow task for #5 at commit.
 * @param {string} label */
function projectRepo(label) {
  const r = newRepo(label);
  mkdirSync(path.join(r.dir, ".xenomoon"));
  const res = setFlow([], { issue: 5, to: "commit" }, "2026-11-28T10:00:00.000Z");
  const file = path.join(r.dir, ".xenomoon", "tasks.json");
  writeFileSync(file, JSON.stringify(res.list, null, 2) + "\n");
  return { ...r, file };
}

/** @param {string} file @returns {{ flow?: { at: string, fix: number, rejected?: string } }} */
const firstTask = (file) =>
  /** @type {{ flow?: { at: string, fix: number, rejected?: string } }[]} */ (
    parseJSON(readFileSync(file, "utf8"))
  )[0] ?? {};

/** @param {{ dir: string, sha: string, id: string }} r @param {string} [command] */
const gateRepo = (r, command) =>
  gate({ labels: GREEN, comments: [qaPass(r.sha, r.id), reviewPass(r.sha, r.id)] }, command, {
    dir: r.dir,
  });

test("commit-gate: an edit after the pass denies and moves the flow task to fix", { skip }, () => {
  const p = projectRepo("edited");
  writeFileSync(path.join(p.dir, "a.txt"), "edited after the pass\n");
  const now = contentOf(p.dir);
  assert.notEqual(now, p.id);
  const r = gateRepo(p);
  assert.equal(r.decision, "deny");
  assert.match(r.reason, /qa-content/);
  assert.match(r.reason, /review-content/);
  const t = firstTask(p.file);
  assert.equal(t.flow?.at, "fix");
  assert.equal(t.flow?.fix, 1);
  assert.equal(t.flow?.rejected, now);
});

test(
  "commit-gate: the same refused content again denies and counts no second round",
  { skip },
  () => {
    const p = projectRepo("twice");
    writeFileSync(path.join(p.dir, "a.txt"), "edited after the pass\n");
    assert.equal(gateRepo(p).decision, "deny");
    const bytes = readFileSync(p.file);
    const again = gateRepo(p);
    assert.equal(again.decision, "deny");
    assert.deepEqual(readFileSync(p.file), bytes);
    assert.equal(firstTask(p.file).flow?.fix, 1);
  },
);

test(
  "commit-gate: a pass with no review-content mark asks, and so does one with no qa-content",
  { skip },
  () => {
    const { sha, id, dir } = newRepo("nomark");
    const qaBare = `## 🧪 QA — PASS\n\nall green\n\nqa-verified: ${sha}`;
    const revBare = `## 🔎 REVIEW — pass\n\nok\n\nreview-verified: ${sha}`;
    const noReview = gate({ labels: GREEN, comments: [qaPass(sha, id), revBare] }, undefined, {
      dir,
    });
    assert.equal(noReview.decision, "ask");
    assert.match(noReview.reason, /review-content/);
    const noQa = gate({ labels: GREEN, comments: [qaBare, reviewPass(sha, id)] }, undefined, {
      dir,
    });
    assert.equal(noQa.decision, "ask");
    assert.match(noQa.reason, /qa-content/);
  },
);

test("commit-gate: a content mark shorter than 40 hex asks and moves nothing", { skip }, () => {
  const p = projectRepo("shortmark");
  const bytes = readFileSync(p.file);
  const r = gate(
    {
      labels: GREEN,
      comments: [qaPass(p.sha, p.id), reviewPass(p.sha, p.id.slice(0, 39))],
    },
    undefined,
    { dir: p.dir },
  );
  assert.equal(r.decision, "ask");
  assert.match(r.reason, /review-content/);
  assert.deepEqual(readFileSync(p.file), bytes);
});

test(
  "commit-gate: matching marks but an unstaged or an untracked file ask, naming the file",
  { skip },
  () => {
    const unstaged = newRepo("unstaged");
    writeFileSync(path.join(unstaged.dir, "a.txt"), "second edit, not staged\n");
    const u = gateRepo({ ...unstaged, id: contentOf(unstaged.dir) });
    assert.equal(u.decision, "ask");
    assert.match(u.reason, /not staged/);
    assert.match(u.reason, /a\.txt/);

    const untracked = newRepo("untracked");
    writeFileSync(path.join(untracked.dir, "b.txt"), "new\n");
    const t = gateRepo({ ...untracked, id: contentOf(untracked.dir) });
    assert.equal(t.decision, "ask");
    assert.match(t.reason, /b\.txt/);
  },
);

test(
  "commit-gate: matching marks and a staged file under .xenomoon asks, naming it",
  { skip },
  () => {
    const r = newRepo("xmstaged");
    mkdirSync(path.join(r.dir, ".xenomoon"));
    writeFileSync(path.join(r.dir, ".xenomoon", "note.txt"), "x\n");
    git(r.dir, "add", ".xenomoon/note.txt");
    assert.equal(contentOf(r.dir), r.id);
    const res = gateRepo(r);
    assert.equal(res.decision, "ask");
    assert.match(res.reason, /\.xenomoon\/note\.txt/);
  },
);

test(
  "commit-gate: git -C <sibling> commit is judged by the sibling's HEAD and content",
  { skip },
  () => {
    const here = newRepo("here");
    const sib = newRepo("sibling");
    assert.notEqual(here.sha, sib.sha);
    const command = `git -C ${sib.dir} commit -m "x (#5)"`;
    /** @param {{ sha: string, id: string }} m */
    const run = (m) =>
      gate({ labels: GREEN, comments: [qaPass(m.sha, m.id), reviewPass(m.sha, m.id)] }, command, {
        dir: here.dir,
        payloadCwd: here.dir,
      });
    const ok = run(sib);
    assert.equal(ok.decision, "allow");
    assert.match(ok.reason, new RegExp(sib.sha.slice(0, 7)));
    const other = run(here);
    assert.equal(other.decision, "deny");
    assert.match(other.reason, new RegExp(`committing on ${sib.sha.slice(0, 7)}`));
  },
);

test("commit-gate: a stale sha and no content mark still denies on the sha", { skip }, () => {
  const stale = "a".repeat(40);
  const bare = (/** @type {string} */ h) => [
    `## 🧪 QA — PASS\n\nok\n\nqa-verified: ${h}`,
    `## 🔎 REVIEW — pass\n\nok\n\nreview-verified: ${h}`,
  ];
  const r = gate({ labels: GREEN, comments: bare(stale) });
  assert.equal(r.decision, "deny");
  assert.match(r.reason, /QA verified #5 at aaaaaaa/);
});

test("issuekit fingerprint prints exactly the content id of the repo it runs in", { skip }, () => {
  const r = spawnSync(process.execPath, [ISSUE_CLI, "fingerprint"], {
    cwd: repo,
    env,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${contentOf(repo)}\n`);
});

// --- #110 fix round 1: two -C folders, and a missing jq ----------------------------------------

/** @typedef {{ hookSpecificOutput: { permissionDecision: string, permissionDecisionReason: string } }} Out */

/** A bin dir whose `gh` leaves a marker file when it is called.
 * @param {string} label @returns {{ bin: string, marker: string }} */
function markerGh(label) {
  const bin = path.join(root, `${label}-bin`);
  const marker = path.join(root, `${label}-gh-called`);
  mkdirSync(bin);
  const gh = path.join(bin, "gh");
  writeFileSync(gh, `#!/bin/sh\ntouch "${marker}"\ncat "${fixture}"\n`);
  chmodSync(gh, 0o755);
  return { bin, marker };
}

/** Run the hook with PATH replaced; the raw result, no decision parsing.
 * @param {string} command @param {string} pathValue */
function rawGate(command, pathValue) {
  return spawnSync("bash", [HOOK], {
    input: JSON.stringify({ tool_input: { command } }),
    cwd: repo,
    env: { ...env, PATH: pathValue },
    encoding: "utf8",
  });
}

/** @param {string} bin */
const withGh = (bin) => `${bin}${path.delimiter}${env["PATH"] ?? ""}`;

test("commit-gate: two -C folders ask naming -C, before the issue is read", { skip }, () => {
  const { bin, marker } = markerGh("twoc");
  writeFileSync(fixture, JSON.stringify({ labels: [], comments: [] }));
  const r = rawGate(`git -C ${repo} -C ${root} commit -m "x (#5)"`, withGh(bin));
  assert.equal(r.status, 0, r.stderr);
  const out = /** @type {Out} */ (parseJSON(r.stdout)).hookSpecificOutput;
  assert.equal(out.permissionDecision, "ask");
  assert.match(out.permissionDecisionReason, /-C/);
  assert.equal(existsSync(marker), false, "gh must not be called before the ask");
});

test(
  "commit-gate: -C a -C b only inside the commit message is not two -C folders",
  { skip },
  () => {
    const { bin, marker } = markerGh("msgc");
    writeFileSync(fixture, JSON.stringify({ labels: [], comments: [] }));
    const r = rawGate(`git commit -m "x (#5) -C a -C b"`, withGh(bin));
    assert.equal(r.status, 0, r.stderr);
    const out = /** @type {Out} */ (parseJSON(r.stdout)).hookSpecificOutput;
    // The normal decision for an empty issue: no pipeline state, an ask that is not the -C one.
    assert.equal(existsSync(marker), true, "the issue was read, so the -C check did not fire");
    assert.equal(out.permissionDecision, "ask");
    assert.match(out.permissionDecisionReason, /no pipeline state/);
  },
);

/** A bin dir with symlinks to only the tools the hook uses before its first jq call (no jq). */
function noJqBin() {
  const bin = path.join(root, "nojq-bin");
  mkdirSync(bin);
  for (const tool of "bash git grep cat dirname sed tr wc head awk sort".split(" ")) {
    const found = (process.env["PATH"] ?? "")
      .split(path.delimiter)
      .map((d) => path.join(d, tool))
      .find((p) => existsSync(p) && spawnSync("test", ["-x", p]).status === 0);
    assert.ok(found, `${tool} not found on PATH`);
    symlinkSync(found, path.join(bin, tool));
  }
  return bin;
}

test(
  "commit-gate: with jq missing a commit asks in valid JSON, a non-commit is silent",
  { skip },
  () => {
    const bin = noJqBin();
    const probe = spawnSync(path.join(bin, "bash"), ["-c", "command -v jq"], {
      env: { PATH: bin },
    });
    assert.notEqual(probe.status, 0, "jq must be hidden");
    const commit = rawGate('git commit -m "x (#5)"', bin);
    assert.equal(commit.status, 0, commit.stderr);
    const out = /** @type {Out} */ (parseJSON(commit.stdout)).hookSpecificOutput;
    assert.equal(out.permissionDecision, "ask");
    assert.match(out.permissionDecisionReason, /jq/);
    const other = rawGate("git status", bin);
    assert.equal(other.status, 0, other.stderr);
    assert.equal(other.stdout, "");
  },
);
