// The "How far" line of the contract, read from an issue body, and the stop sentence Publish
// shows when a move goes past it. Pure: strings in, strings out, no gh and no repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readHowFar, howFarStop, HOW_FAR_LABELS } from "./how-far.js";

const ALL = /** @type {const} */ (["pr", "merged", "deployed", "none", "unclear"]);
const MOVES = /** @type {const} */ (["merge", "deploy"]);

test("the three values, as the template writes them", () => {
  const table = /** @type {const} */ ([
    ["How far: pull request opened, as the owner confirmed", "pr"],
    ["How far: merged, as the owner confirmed", "merged"],
    ["How far: deployed, as the owner confirmed", "deployed"],
  ]);
  for (const [line, want] of table) assert.equal(readHowFar(line), want, line);
});

test("case, bullet, bold, backticks, CRLF and the short forms are read", () => {
  const table = /** @type {const} */ ([
    ["HOW FAR: MERGED, as the owner confirmed", "merged"],
    ["how far: Deployed", "deployed"],
    ["- How far: merged, as the owner confirmed", "merged"],
    ["* How far: deployed", "deployed"],
    ["**How far:** merged, as the owner confirmed", "merged"],
    ["**How far**: merged", "merged"],
    ["How far: **deployed**, as the owner confirmed", "deployed"],
    ["How far: `merged`, as the owner confirmed", "merged"],
    ["How far: PR opened, as the owner confirmed", "pr"],
    ["How far: pr", "pr"],
    ["Title\r\nHow far: merged, as the owner confirmed\r\nNext", "merged"],
  ]);
  for (const [body, want] of table) assert.equal(readHowFar(body), want, JSON.stringify(body));
});

test("no line, and a body that is not a string, read as none", () => {
  assert.equal(readHowFar(""), "none");
  assert.equal(readHowFar("## Facts\nNothing about it here.\n"), "none");
  for (const body of [undefined, null, 42, {}, ["How far: merged"]]) {
    assert.equal(readHowFar(body), "none", JSON.stringify(body) ?? "undefined");
  }
});

test("the untouched template, an unknown value and an empty value read as unclear", () => {
  const table = [
    "How far: <pull request opened | merged | deployed>, as the owner confirmed",
    "How far: shipped, as the owner confirmed",
    "How far: merged and deployed",
    "How far:",
    "How far:   ",
    "How far: , as the owner confirmed",
  ];
  for (const body of table) assert.equal(readHowFar(body), "unclear", body);
});

test("two lines that agree give the value; two that differ are unclear", () => {
  assert.equal(
    readHowFar("How far: merged\n\nHow far: **merged**, as the owner confirmed"),
    "merged",
  );
  assert.equal(readHowFar("How far: pr\nHow far: pull request opened"), "pr");
  assert.equal(readHowFar("How far: merged\nHow far: deployed"), "unclear");
  assert.equal(readHowFar("How far: merged\nHow far: shipped"), "unclear");
});

test("a line inside a ``` fence is not read", () => {
  const fenced = "```\nHow far: deployed, as the owner confirmed\n```";
  assert.equal(readHowFar(fenced), "none");
  assert.equal(readHowFar(`${fenced}\nHow far: merged, as the owner confirmed`), "merged");
  assert.equal(readHowFar(`How far: pr\n${fenced}\n`), "pr");
  assert.equal(readHowFar("```md\nHow far: merged"), "none", "an unclosed fence hides the rest");
});

test("a line inside a ~~~ fence is not read", () => {
  const fenced = "~~~\nHow far: deployed, as the owner confirmed\n~~~";
  assert.equal(readHowFar(fenced), "none");
  assert.equal(readHowFar(`${fenced}\nHow far: merged, as the owner confirmed`), "merged");
  assert.equal(readHowFar(`How far: pr\n${fenced}\n`), "pr");
});

test("a fence is closed only by the same character, and not by a shorter marker", () => {
  assert.equal(readHowFar("````\n```\nHow far: deployed\n````\nHow far: pr"), "pr");
  assert.equal(readHowFar("```\n~~~\nHow far: deployed\n```\nHow far: merged"), "merged");
});

test("a full realistic body reads the contract's value, not the fenced example", () => {
  const body = [
    "## Contract",
    "",
    "- Goal: the push gate names the issue it stops.",
    "- Done when: the stop sentence appears in the receipt.",
    "- Out of scope: deploy tooling.",
    "- Proof: node --test, then the page in Chrome.",
    "- Risk: low.",
    "- Owner stop: before Publish.",
    "- How far: merged, as the owner confirmed",
    "",
    "## Facts",
    "",
    "The gate reads the body once.",
    "",
    "## Tech design",
    "",
    "Write the line like this:",
    "",
    "```md",
    "How far: deployed, as the owner confirmed",
    "```",
    "",
  ].join("\n");
  assert.equal(readHowFar(body), "merged");
  assert.equal(readHowFar(body.replace(/\n/g, "\r\n")), "merged");
});

test("howFarStop: deploy only with deployed; merge with merged or deployed", () => {
  for (const howFar of ALL) {
    for (const move of MOVES) {
      const allowed =
        move === "deploy" ? howFar === "deployed" : howFar === "merged" || howFar === "deployed";
      const got = howFarStop(howFar, move, 110);
      if (allowed) assert.equal(got, "", `${howFar} ${move} must be allowed`);
      else assert.ok(got.length > 0, `${howFar} ${move} must be refused with a sentence`);
    }
  }
});

test("a refusal is one non-empty sentence, and an allowed move is the empty string", () => {
  const refused = howFarStop("pr", "merge", 110);
  assert.equal(typeof refused, "string");
  assert.ok(refused.trim().length > 0);
  assert.ok(!refused.includes("\n"), "one sentence, one line");
  assert.equal(howFarStop("deployed", "deploy", 110), "");
});

test("a stop sentence names the issue as #N for 110, '110' and '#110'", () => {
  for (const issue of [110, "110", "#110"]) {
    const got = howFarStop("pr", "merge", issue);
    assert.ok(got.includes("#110"), `${String(issue)}: ${got}`);
    assert.ok(!got.includes("##110"), `${String(issue)}: ${got}`);
  }
});

test("a stop sentence quotes the contract's words and says Ready, not published", () => {
  assert.deepEqual(HOW_FAR_LABELS, {
    pr: "pull request opened",
    merged: "merged",
    deployed: "deployed",
  });
  for (const howFar of /** @type {const} */ (["pr", "merged"])) {
    const got = howFarStop(howFar, "deploy", "#7");
    assert.ok(got.includes(HOW_FAR_LABELS[howFar]), got);
    assert.ok(got.includes("Ready, not published"), got);
  }
  for (const howFar of /** @type {const} */ (["none", "unclear"])) {
    const got = howFarStop(howFar, "merge", 7);
    assert.ok(got.length > 0);
    assert.ok(got.includes("#7"), got);
    assert.ok(got.includes("Ready, not published"), got);
  }
  assert.ok(howFarStop("none", "merge", 7).includes('no "How far" line'));
});
