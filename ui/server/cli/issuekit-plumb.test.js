// The merge/promote contract decision and the PR's cited issues, tested without gh or git:
// facts in, STOPs/FLAGs out. A refusal is asserted by its sentence, not by a count alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contractStops, prCitedIssues } from "./issuekit-plumb.js";

/** @param {string} num @param {import("./how-far.js").HowFar} howFar @param {boolean} [readable] */
const issue = (num, howFar, readable = true) => ({ num, readable, howFar });

test("contractStops: every How far value against both moves", () => {
  /** @type {[import("./how-far.js").HowFar, "merge" | "deploy", boolean][]} */
  const table = [
    ["deployed", "merge", false],
    ["deployed", "deploy", false],
    ["merged", "merge", false],
    ["merged", "deploy", true],
    ["pr", "merge", true],
    ["pr", "deploy", true],
    ["unclear", "merge", true],
    ["unclear", "deploy", true],
  ];
  for (const [howFar, move, stops] of table) {
    const v = contractStops({ move, issues: [issue("5", howFar)] });
    assert.equal(v.stops.length, stops ? 1 : 0, `${howFar} x ${move}`);
    if (stops)
      assert.match(
        v.stops[0] ?? "",
        new RegExp(`^Issue #5 .*so ${move} is past what the owner allowed`),
        `${howFar} x ${move}`,
      );
    assert.deepEqual(v.flags, [], `${howFar} x ${move}: no flag`);
  }
});

test("contractStops: no line is a FLAG, never a STOP, for either move", () => {
  for (const move of /** @type {const} */ (["merge", "deploy"])) {
    const v = contractStops({ move, issues: [issue("8", "none")] });
    assert.deepEqual(v.stops, [], move);
    assert.equal(v.flags.length, 1, move);
    assert.match(v.flags[0] ?? "", /^#8 has no "How far" line — not checked against a contract/);
  }
});

test("contractStops: an unreadable issue STOPs, saying the contract cannot be checked", () => {
  const v = contractStops({ move: "merge", issues: [issue("9", "none", false)] });
  assert.deepEqual(v.stops, ["could not read #9, so the contract cannot be checked"]);
  assert.deepEqual(v.flags, []);
});

test("contractStops: no issue gives one FLAG that carries `what`", () => {
  const named = contractStops({ move: "merge", issues: [], what: "PR #12" });
  assert.deepEqual(named.stops, []);
  assert.deepEqual(named.flags, ["PR #12 cites no issue — nothing to check against a contract"]);
  const plain = contractStops({ move: "deploy", issues: [] });
  assert.match(plain.flags[0] ?? "", /^the change cites no issue/);
});

test("contractStops: two issues with different lines under deploy give one STOP, for the short one", () => {
  const v = contractStops({
    move: "deploy",
    issues: [issue("1", "deployed"), issue("2", "merged")],
  });
  assert.equal(v.stops.length, 1);
  assert.match(v.stops[0] ?? "", /^Issue #2 has "How far: merged", so deploy is past/);
});

test("prCitedIssues: (#N) in the title", () => {
  assert.deepEqual(prCitedIssues("fix: thing (#12)", ""), ["12"]);
});

test("prCitedIssues: a Refs list reads every number, in any case, each issue once", () => {
  assert.deepEqual(prCitedIssues("", "Refs #3, #4 and #9"), ["3", "4", "9"]);
  assert.deepEqual(prCitedIssues("", "REFS #5\n\nrefs #6"), ["5", "6"]);
  assert.deepEqual(prCitedIssues("x (#3)", "Refs #3, #4\nRefs #4"), ["3", "4"]);
});

test("prCitedIssues: only Refs and the title cite — `see #99` is not read, and neither is `Closes #7`", () => {
  assert.deepEqual(prCitedIssues("", "see #99 for context"), []);
  // Real behaviour: the pattern is `refs` only, so `Closes #7` cites nothing.
  assert.deepEqual(prCitedIssues("", "Closes #7"), []);
  assert.deepEqual(prCitedIssues("", "see #99\nCloses #7\nRefs #1"), ["1"]);
});
