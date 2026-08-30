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
  spendsMoney,
} from "./consequential.js";
import { readBranchModel, deployReaching, branchCreationRoutine } from "./branch-doctrine.js";

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

test("branchCreationRoutine: the model sanctions work branches — deviations gate", () => {
  const d = (/** @type {"pr-main"|"trunk"|"staged"} */ model) => ({
    model,
    prod: "main",
    dev: "development",
  });
  assert.equal(branchCreationRoutine(d("pr-main")), true);
  assert.equal(branchCreationRoutine(d("staged")), true);
  assert.equal(branchCreationRoutine(d("trunk")), false); // trunk keeps no work branches
  assert.equal(branchCreationRoutine(null), false); // custom/absent — nothing to check against
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

// ── spend ────────────────────────────────────────────────────────────────────
// The live patterns of a project that actually spends, used verbatim below so these tests fail
// the way the real gate would.
const SPEND_PATTERNS = [
  "gen:assets",
  "gen-assets.ts",
  "promptfoo eval",
  "eval:test",
  "eval:real-vision",
  "eval:vision",
  "gen-facts.ts",
  "gen:facts",
  "diagnose.ts",
  "pnpm diagnose",
];

test("spendsMoney: metered hostnames spend from any RUNNER segment", () => {
  for (const cmd of [
    "curl https://api.openai.com/v1/chat",
    "curl -s 'https://API.OPENAI.COM/v1'",
    `node -e "fetch('https://generativelanguage.googleapis.com/x')"`,
    "x && curl https://api.anthropic.com/v1",
  ])
    assert.equal(spendsMoney(cmd, []), true, cmd);
  assert.equal(spendsMoney("curl https://example.com/api", []), false);
});

test("spendsMoney: project patterns need the RUNNER position — inspection never asks", () => {
  for (const cmd of [
    'grep -rn "eval:test" docs/',
    "rtk grep eval:test .",
    "rg gen-assets.ts src/",
    'sed -i "" s/eval:test/eval:paid/g package.json',
    "cat docs/gen-facts.ts.md",
    "echo pnpm diagnose",
    'pgrep -fl "gen-assets"',
    "ls scripts/ | grep diagnose.ts",
    'git log -S"eval:test"',
    `jq '.scripts["eval:test"]' package.json`,
  ])
    assert.equal(spendsMoney(cmd, SPEND_PATTERNS), false, cmd);
  for (const cmd of [
    "pnpm -C worker eval:test",
    "npm run eval:test",
    "node scripts/gen-assets.ts",
    "tsx gen-assets.ts",
    "npx promptfoo eval -c f.yaml",
    "pnpm diagnose",
  ])
    assert.equal(spendsMoney(cmd, SPEND_PATTERNS), true, cmd);
});

test("spendsMoney: the runner survives rtk, env prefixes, chains, subshells and redirects", () => {
  for (const cmd of [
    "rtk pnpm -C worker eval:test",
    "FOO=1 pnpm eval:test",
    "env FOO=1 pnpm eval:test",
    "timeout 300 pnpm eval:test",
    "cd worker && pnpm eval:test",
    "(cd worker && pnpm eval:test)",
    "echo $(pnpm eval:test)",
    "pnpm eval:test 2>&1 | tee log",
    "pnpm eval:test\npnpm gen:facts",
  ])
    assert.equal(spendsMoney(cmd, SPEND_PATTERNS), true, cmd);
  for (const cmd of [
    "pnpm ls | grep eval:test",
    "git status && grep -rn eval:test docs/",
    'cat a.md | rg "promptfoo eval"',
  ])
    assert.equal(spendsMoney(cmd, SPEND_PATTERNS), false, cmd);
});

test("spendsMoney: pattern shapes — script name, path-as-argument, multiword with workspace flags", () => {
  assert.equal(spendsMoney("pnpm --filter web gen:assets", SPEND_PATTERNS), true);
  assert.equal(spendsMoney("pnpm -C worker diagnose", ["pnpm diagnose"]), true);
  assert.equal(spendsMoney("./node_modules/.bin/promptfoo eval", SPEND_PATTERNS), true);
  assert.equal(spendsMoney("node ./scripts/gen-assets.ts", SPEND_PATTERNS), true);
  assert.equal(spendsMoney('pnpm -C worker "eval:test"', SPEND_PATTERNS), true);
  assert.equal(spendsMoney("pnpm run build", ["pnpm diagnose"]), false);
  assert.equal(spendsMoney("pnpm install", SPEND_PATTERNS), false);
});

test("spendsMoney: unusable patterns are skipped, never fatal", () => {
  // A hand-edited config can hold junk; the gate skips it and the good patterns still hold.
  const junk = /** @type {string[]} */ (/** @type {unknown} */ (["", null, 42, "eval:test"]));
  const allJunk = /** @type {string[]} */ (/** @type {unknown} */ ([null, 42]));
  assert.equal(spendsMoney("pnpm eval:test", junk), true);
  assert.equal(spendsMoney("pnpm build", allJunk), false);
  assert.equal(spendsMoney("pnpm eval:test"), false);
});

test("spendsMoney: a metered hostname NAMED by an inspector is not a call", () => {
  // Live bite 2026-08-30, on a project whose whole subject is the OpenAI API: the hostname test
  // ran against the FULL command string, so reading, searching and describing the endpoint all
  // asked for spend consent. Every one of these is a false prompt, and false prompts are how a
  // human learns to approve without reading.
  for (const cmd of [
    'grep -rn "api.openai.com" worker/src/',
    "rtk grep -rn api.openai.com docs/",
    "rg openrouter.ai .",
    "cat docs/api.openai.com.md",
    'git commit -m "fix: drop the api.openai.com fallback"',
    'git log -S"api.anthropic.com"',
    "sed -n 1,40p vendor/api.openai.com.json",
    'jq ".hosts[\\"api.openai.com\\"]" config.json',
    "echo api.openai.com",
  ])
    assert.equal(spendsMoney(cmd, SPEND_PATTERNS), false, cmd);
});

test("spendsMoney: a DATA heredoc body is a document, not a command", () => {
  // The report that documented this very bug quoted `curl https://api.openai.com/...` as its own
  // evidence — and writing it asked for spend. A quoted-delimiter heredoc feeding a non-executor
  // is file content; the shell runs none of it.
  const report = [
    "mkdir -p .xenomoon/handoffs && cat > .xenomoon/handoffs/review.md <<'EOF'",
    "# Review",
    "F2: the code falls back to https://api.openai.com/v1/images/edits",
    "Reproduce with:",
    "curl https://api.openai.com/v1/images/edits -d @p.json",
    "EOF",
  ].join("\n");
  assert.equal(spendsMoney(report, SPEND_PATTERNS), false);
  assert.equal(spendsMoney("tee r.md <<'EOF'\npnpm eval:test\nEOF", SPEND_PATTERNS), false);

  // Withheld exactly where the body IS executed: stdin to a runner, or an unquoted delimiter
  // (which expands, so a substitution inside it runs).
  assert.equal(spendsMoney("bash <<'EOF'\ncurl https://api.openai.com/v1\nEOF", []), true);
  assert.equal(spendsMoney("python3 <<'EOF'\nimport x  # api.openai.com\nEOF", []), true);
  assert.equal(spendsMoney("cat > r.md <<EOF\n$(pnpm eval:test)\nEOF", SPEND_PATTERNS), true);
});

test("spendsMoney: markdown prose never reads as an executable", () => {
  // Report bodies are bullets and backticked paths. `- \`worker/src/ai.ts\`` skipped the `-` as a
  // flag and landed on a path-shaped token, which the old path-shape heuristic called a runner.
  for (const cmd of [
    "- `worker/src/ai/responses.ts:495` calls https://api.openai.com/v1",
    "* see scripts/gen-assets.ts for the batch",
    "3. the eval:test target hits openrouter.ai",
    "> quoted: api.mistral.ai is the fallback",
    "# api.groq.com notes",
    "| host | api.cohere.ai |",
  ])
    assert.equal(spendsMoney(cmd, SPEND_PATTERNS), false, cmd);
});

test("spendsMoney: grouping and network runners still spend", () => {
  assert.equal(spendsMoney("( pnpm eval:test )", SPEND_PATTERNS), true);
  assert.equal(spendsMoney("{ pnpm diagnose; }", SPEND_PATTERNS), true);
  assert.equal(spendsMoney("echo $(pnpm diagnose)", SPEND_PATTERNS), true);
  assert.equal(spendsMoney("docker run img curl https://api.openai.com/v1", []), true);
  assert.equal(spendsMoney("http POST https://api.openai.com/v1", []), true);
  assert.equal(spendsMoney("timeout 300 rtk pnpm eval:test", SPEND_PATTERNS), true);
});
