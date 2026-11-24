// classifyConsequential gives a framework merge the hook's answer (#99): denied whatever policy.merge
// says, while a merge in the project is classified by mergeDecision as before.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// config.js resolves PROJECT_DIR at import: point it at a throwaway project first.
const project = mkdtempSync(path.join(tmpdir(), "xm-uicontrol-"));
process.env.GAME_DIR = project;
after(() => {
  rmSync(project, { recursive: true, force: true });
});

const { classifyConsequential } = await import("./ui-control.js");
const { FRAMEWORK_DIR, getActionPolicy } = await import("./config.js");
const { FRAMEWORK_MERGE_DENY, mergeDecision } = await import("../../lib/consequential.js");

const allowMerges = { ...getActionPolicy(), merge: /** @type {const} */ ("allow") };

test("a PR merge run in the framework folder is denied even with merge policy allow", () => {
  const r = classifyConsequential(`cd ${FRAMEWORK_DIR} && gh pr merge 12`, allowMerges, "main");
  assert.deepEqual(r.denials, [FRAMEWORK_MERGE_DENY]);
  assert.deepEqual(r.questions, []);
});

test("a GraphQL merge run in the framework folder is denied too", () => {
  for (const mutation of ["mergePullRequest", "enablePullRequestAutoMerge"]) {
    const cmd = `cd ${FRAMEWORK_DIR} && gh api graphql -f query="mutation { ${mutation}(input: {}) { clientMutationId } }"`;
    const r = classifyConsequential(cmd, allowMerges, "main");
    assert.deepEqual(r.denials, [FRAMEWORK_MERGE_DENY], mutation);
  }
});

test("a PR merge in the project is classified by mergeDecision as before", () => {
  for (const merge of /** @type {const} */ (["allow", "ask"])) {
    const policy = { ...getActionPolicy(), merge };
    const r = classifyConsequential("gh pr merge 12", policy, "main");
    const d = mergeDecision("main", false, merge);
    assert.deepEqual(r.denials, []);
    assert.deepEqual(r.questions, d.verdict === "ask" ? [d.message] : []);
  }
});
