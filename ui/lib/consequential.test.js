// The push/merge/branch decision logic — the matrices the Codex plan review demanded in writing.
// Pure functions only; the hook-side wiring is smoke-tested by hand (payloads through the hooks),
// the decisions here are where a wrong answer ships.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  PUSH_RE,
  MERGE_RE,
  BRANCH_CREATE_RE,
  PUSH_AGENT,
  pushDecision,
  mergeDecision,
  routinePushTarget,
} from "./consequential.js";
import { readBranchModel, deployReaching } from "./branch-doctrine.js";

/** Both policy values, typed for checkJs. @type {("ask" | "allow")[]} */
const POLICIES = ["ask", "allow"];

test("PUSH_RE: push shapes match, lookalikes do not", () => {
  for (const cmd of ["git push", "rtk git push", "git -C ../wt push", "x && git push", "git push;"])
    assert.equal(PUSH_RE.test(cmd), true, cmd);
  for (const cmd of ["git pushd", "npm run push-docs", "echo git-push"])
    assert.equal(PUSH_RE.test(cmd), false, cmd);
});

test("routinePushTarget: ONLY the strict shape names a branch — everything else null (fail-closed)", () => {
  assert.equal(routinePushTarget("git push origin feat/42"), "feat/42");
  assert.equal(routinePushTarget("rtk git push origin feat/42"), "feat/42");
  assert.equal(routinePushTarget("git -C ../wt push origin fix-1"), "fix-1");
  assert.equal(routinePushTarget("git push -u origin feat/42"), "feat/42");
  assert.equal(routinePushTarget("git push --set-upstream origin main"), "main");
  for (const cmd of [
    "git push", // bare — target unstated
    "git push origin", // remote only
    "git push origin HEAD",
    "git push origin local:remote", // refspec — remote side is not this parser's guess to make
    "git push --force origin feat/42",
    "git push --force-with-lease origin feat/42",
    "git push --delete origin feat/42",
    "git push --mirror origin",
    "git push --all origin",
    "git push --tags origin main",
    "git push --repo origin main", // flag arity trap from the Codex review
    "git push -o ci.skip origin main",
    "git push origin main extra", // trailing token — not the shape
    'git push origin "feat/42"', // quoted — not the bare shape
    "git commit -m x && git push origin feat/42", // chained — the whole line must be the push
  ])
    assert.equal(routinePushTarget(cmd), null, cmd);
});

test("pushDecision: the orchestrator is denied under EVERY policy — routing, not policy", () => {
  for (const policy of POLICIES)
    for (const reaches of [true, false, null]) {
      const d = pushDecision("main", false, policy, reaches);
      assert.equal(d.verdict, "deny");
      assert.match(d.message, /senior-analyst/);
      assert.match(d.message, /push-method/);
    }
});

test("pushDecision: the author lanes are denied under EVERY policy — adversarial separation", () => {
  for (const agent of ["developer", "tester", "junior-analyst", "xenomoon:developer"])
    for (const policy of POLICIES) {
      const d = pushDecision(agent, true, policy, false);
      assert.equal(d.verdict, "deny", `${agent}/${policy}`);
      assert.match(d.message, /ready-to-push/);
    }
});

test("pushDecision: the push lane — routine allowed, deploy/unknown rides policy", () => {
  // Routine work-branch push: allowed regardless of policy.
  assert.equal(pushDecision(PUSH_AGENT, true, "ask", false).verdict, "allow");
  assert.equal(pushDecision(PUSH_AGENT, true, "allow", false).verdict, "allow");
  // Deploy-reaching: ask by default, allow only by the opt-in (documented semantics — Codex #3).
  assert.equal(pushDecision(PUSH_AGENT, true, "ask", true).verdict, "ask");
  assert.equal(pushDecision(PUSH_AGENT, true, "allow", true).verdict, "allow");
  // Unknown target gates exactly like deploy-reaching.
  assert.equal(pushDecision(PUSH_AGENT, true, "ask", null).verdict, "ask");
  // Plugin-qualified dispatch name resolves to the same lane.
  assert.equal(pushDecision(`xenomoon:${PUSH_AGENT}`, true, "ask", false).verdict, "allow");
});

test("pushDecision: the unnamed surface (hooks) never hard-denies — ask or allow only", () => {
  for (const isSub of [true, false])
    for (const policy of POLICIES)
      for (const reaches of [true, false, null]) {
        const v = pushDecision(null, isSub, policy, reaches).verdict;
        assert.notEqual(v, "deny", `null/${isSub}/${policy}/${reaches}`);
      }
  assert.equal(pushDecision(null, true, "ask", null).verdict, "ask");
  assert.equal(pushDecision(null, true, "allow", true).verdict, "allow");
  assert.equal(pushDecision(null, false, "ask", false).verdict, "allow"); // routine is routine here too
});

test("MERGE_RE: PR-merge/promote commands, not git merge", () => {
  for (const cmd of [
    "gh pr merge 12 --squash",
    "rtk gh pr merge 12",
    "issuekit pr merge 12 --when-green",
    "node /x/ui/server/cli/issuekit.js pr merge 12",
    "issuekit promote",
    "issuekit branch prune --apply",
    "echo hi && gh pr merge 9",
  ])
    assert.equal(MERGE_RE.test(cmd), true, cmd);
  for (const cmd of ["git merge origin/main", "issuekit branch prune", "gh pr view 12"])
    assert.equal(MERGE_RE.test(cmd), false, cmd);
});

test("mergeDecision: workers denied under every policy; main rides policy.merge", () => {
  for (const policy of POLICIES) {
    assert.equal(mergeDecision("developer", true, policy).verdict, "deny");
    assert.equal(mergeDecision(null, true, policy).verdict, "deny");
  }
  assert.equal(mergeDecision("main", false, "ask").verdict, "ask");
  assert.equal(mergeDecision("main", false, "allow").verdict, "allow");
  assert.equal(mergeDecision(null, false, "ask").verdict, "ask");
});

test("BRANCH_CREATE_RE: worktree add of an EXISTING branch is not branch creation", () => {
  for (const cmd of [
    "git worktree add ../wt fix/42", // the worktree-discipline recipe — the 2026-08-20 freeze
    "rtk git worktree add ../wt existing",
    "git worktree add --detach ../wt",
  ])
    assert.equal(BRANCH_CREATE_RE.test(cmd), false, cmd);
  for (const cmd of [
    "git worktree add ../wt", // single-path form auto-creates a branch
    "git worktree add -b new ../wt",
    "git worktree add -b new ../wt origin/main",
    "git checkout -b x",
    "git switch -c x",
    "git checkout --track origin/x",
    "git branch new-thing",
  ])
    assert.equal(BRANCH_CREATE_RE.test(cmd), true, cmd);
  for (const cmd of ["git switch main", "git branch -d old", "git branch --list"])
    assert.equal(BRANCH_CREATE_RE.test(cmd), false, cmd);
});

test("readBranchModel + deployReaching: the setup choice draws the line, fail-closed", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "xm-bm-"));
  try {
    const write = (/** @type {string} */ content) => {
      mkdirSync(path.join(dir, ".xenomoon"), { recursive: true });
      writeFileSync(path.join(dir, ".xenomoon", "branch-model"), content);
    };
    // Absent file → null → every push gates (older installs).
    assert.equal(readBranchModel(dir), null);
    assert.equal(deployReaching("feat/42", null), null);

    write("pr-main\n");
    const prMain = readBranchModel(dir);
    assert.deepEqual(prMain, { model: "pr-main", prod: "main", dev: "development" });
    assert.equal(deployReaching("feat/42", prMain), false); // routine
    assert.equal(deployReaching("main", prMain), true); // ships
    assert.equal(deployReaching(null, prMain), null); // unnameable target gates

    write("staged\nprod=production\ndev=develop\n");
    const staged = readBranchModel(dir);
    assert.deepEqual(staged, { model: "staged", prod: "production", dev: "develop" });
    assert.equal(deployReaching("develop", staged), false);
    assert.equal(deployReaching("production", staged), true);

    // custom → null → gate; garbage model line → null too.
    write("custom\n");
    assert.equal(readBranchModel(dir), null);
    write("something-else\n");
    assert.equal(readBranchModel(dir), null);
    // Empty projectDir → null.
    assert.equal(readBranchModel(""), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
