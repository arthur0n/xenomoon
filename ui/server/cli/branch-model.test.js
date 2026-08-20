// The picklist's two jobs: order the options by what the project actually does, and read the
// answer without guessing. Both pure, so neither needs a repo or a terminal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deploysOnPush, order, prompt, choose, BRANCH_MODELS } from "./branch-model.js";

/** @param {string} text */
const wf = (text) => [{ name: "w.yml", text }];

test("a push trigger listing the branch is a deploy trigger", () => {
  assert.deepEqual(deploysOnPush(wf("on:\n  push:\n    branches: [main]\n"), "main"), ["w.yml"]);
  assert.deepEqual(deploysOnPush(wf("on:\n  push:\n    branches:\n      - main\n"), "main"), [
    "w.yml",
  ]);
});

test("a push with no branch filter fires on every branch, including this one", () => {
  assert.deepEqual(deploysOnPush(wf("on:\n  push:\n"), "main"), ["w.yml"]);
});

test("another branch is not this branch", () => {
  assert.deepEqual(deploysOnPush(wf("on:\n  push:\n    branches: [develop]\n"), "main"), []);
});

test("a similarly-named branch does not match", () => {
  assert.deepEqual(deploysOnPush(wf("on:\n  push:\n    branches: [maintenance]\n"), "main"), []);
});

test("pull_request alone is not a push", () => {
  assert.deepEqual(
    deploysOnPush(wf("on:\n  pull_request:\n    branches: [main]\n"), "main"),
    [],
    "a PR check is not a deployment",
  );
});

test("the word deploy is not evidence — only the trigger is", () => {
  // A false warning trains people to ignore the true one.
  assert.deepEqual(deploysOnPush(wf("name: deploy docs\non:\n  workflow_dispatch:\n"), "main"), []);
});

test("deploying from the default branch puts the reviewed model first", () => {
  assert.equal(order(true)[0]?.id, "pr-main");
  assert.equal(order(false)[0]?.id, "trunk");
  assert.equal(order(true).length, BRANCH_MODELS.length);
});

test("empty picks the recommended option, not a fixed one", () => {
  assert.equal(choose("", order(true)), "pr-main");
  assert.equal(choose("", order(false)), "trunk");
});

test("a number or a name both select", () => {
  const models = order(true);
  assert.equal(choose("2", models), "trunk");
  assert.equal(choose("staged", models), "staged");
  assert.equal(choose(" PR-MAIN ", models), "pr-main");
});

test("nonsense selects nothing rather than the default", () => {
  const models = order(true);
  assert.equal(choose("9", models), null);
  assert.equal(choose("0", models), null);
  assert.equal(choose("prmain", models), null);
});

test("the warning appears only when earned, and the guideline note always does", () => {
  const models = order(true);
  const withDeploy = prompt({ models, branch: "main", deployWorkflows: ["deploy-api.yml"] });
  assert.match(withDeploy, /deploy-api\.yml/);
  assert.match(withDeploy, /ships to production/);
  assert.match(withDeploy, /not a lock/);

  const without = prompt({ models: order(false), branch: "main", deployWorkflows: [] });
  assert.doesNotMatch(without, /ships to production/);
  assert.match(without, /not a lock/);
});
