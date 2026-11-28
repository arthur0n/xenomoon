// The commit gate (plugin/hooks/commit-gate.sh) run as a real process against made-up issues. A
// temp git repo gives it a HEAD, and a `gh` stand-in first on PATH prints a fixture file, so the
// real gh is never called. The hook is only spawned, never imported.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseJSON } from "./json.js";

const HOOK = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "plugin",
  "hooks",
  "commit-gate.sh",
);

/** @param {string} bin */
const has = (bin) => spawnSync(bin, ["--version"]).status === 0;
const missing = ["jq", "git", "bash"].filter((b) => !has(b));
const skip = missing.length > 0 && `${missing.join(", ")} not on PATH`;

/** @type {string} */ let root = "";
/** @type {string} */ let repo = "";
/** @type {string} */ let fixture = "";
/** @type {string} */ let head = "";
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
  mkdirSync(bin);
  const gh = path.join(bin, "gh");
  writeFileSync(gh, `#!/bin/sh\ncat "${fixture}"\n`);
  chmodSync(gh, 0o755);
  env = e;
});

after(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

/** Write the fixture (null = the stand-in prints nothing) and run the hook on `command`.
 * @param {{ labels?: string[], comments?: string[] } | null} issue @param {string} command */
function gate(issue, command = 'git commit -m "x (#5)"') {
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
    input: JSON.stringify({ tool_input: { command } }),
    cwd: repo,
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
const qaPass = (sha) => `## 🧪 QA — PASS\n\nall green\n\nqa-verified: ${sha}`;
/** @param {string} sha */
const reviewPass = (sha) => `## 🔎 REVIEW — pass\n\nlooks right\n\nreview-verified: ${sha}`;
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
