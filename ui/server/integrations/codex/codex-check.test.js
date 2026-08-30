// node:test coverage for the drift-watch seam in codex-check.js. Only the PURE rule is tested:
// `checkCodex` itself shells the real `codex` CLI (machine-dependent) and `probeCompanionVerbs`
// spawns the vendored companion (absent on the trunk) — `missingVerbs` is the logic both hang on.
import { test } from "node:test";
import assert from "node:assert/strict";

// config.js resolves a domain at import time; the trunk has none bound (same dance as
// codex-tool.test.js).
process.env.XENOMOON_DOMAIN = "webapp";
process.env.GAME_DIR = process.env.GAME_DIR ?? "/tmp/xeno-codex-check-test";
const { missingVerbs } = await import("./codex-check.js");

const FULL_HELP = `Usage: codex-companion.mjs <command>

Commands:
  setup                 check availability
  review                run the built-in reviewer
  adversarial-review    run the adversarial template
  task                  run an arbitrary prompt
  status                list jobs
`;

test("a help text advertising every required verb reports nothing missing", () => {
  assert.deepEqual(missingVerbs(FULL_HELP), []);
});

test("a renamed task verb is reported", () => {
  assert.deepEqual(missingVerbs(FULL_HELP.replace("task ", "run-task ")), ["task"]);
});

test("word boundaries: `review` alone does not satisfy `adversarial-review`", () => {
  const help = "Commands:\n  review    the only verb\n  task      arbitrary prompt\n";
  assert.deepEqual(missingVerbs(help), ["adversarial-review"]);
});

test("word boundaries: `adversarial-review` alone does not satisfy `review`", () => {
  const help = "Commands:\n  adversarial-review   challenge\n  task   arbitrary prompt\n";
  assert.deepEqual(missingVerbs(help), ["review"]);
});

test("an empty help text reports every required verb (caller decides probed:false)", () => {
  assert.deepEqual(missingVerbs(""), ["review", "adversarial-review", "task"]);
});
