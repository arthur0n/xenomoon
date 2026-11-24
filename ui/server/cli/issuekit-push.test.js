// The push gate's DECISION, tested without a repo or gh: facts in, STOPs/FLAGs out. The lane
// parser is checked against the same verdict shapes commit-gate.sh was taught by live issues.
import { test } from "node:test";
import assert from "node:assert/strict";
import { laneVerdict, citedIssues, pushGateVerdict, relateHead } from "./issuekit-push.js";

/** @typedef {import("./issuekit-push.js").PushFacts} PushFacts */
/** @typedef {import("./issuekit-push.js").LaneVerdict} LaneVerdict */

/** @param {LaneVerdict["state"]} state @param {string} sha @param {string} heading @returns {LaneVerdict} */
const lane = (state, sha, heading) => ({ state, sha, heading });

/** @returns {import("./issuekit-push.js").IssueState} */
const ISSUE = () => ({
  num: "42",
  readable: true,
  labels: ["qa:pass", "review:pass"],
  qa: lane("pass", "abc1234", "## 🧪 QA — PASS"),
  review: lane("pass", "abc1234", "## 🔎 REVIEW — pass"),
});

/** @param {Partial<PushFacts>} over @returns {PushFacts} */
const facts = (over = {}) => ({
  branch: "fix/42-x",
  current: "fix/42-x",
  remote: "origin",
  upstream: "origin/fix/42-x",
  setUpstream: false,
  dirty: [],
  ahead: 2,
  behind: 0,
  tip: "c86e464875ff1954ab987c0a60c7b45455c9f471",
  commits: [{ sha: "abc1234", subject: "fix: thing (#42)" }],
  issues: [ISSUE()],
  checks: {
    kind: "pr",
    pr: 7,
    failed: [],
    pending: [],
    hard: [],
    headSha: "",
    headRel: "unknown",
    detail: "PR #7",
  },
  doctrine: { model: "pr-main", prod: "main", dev: "development" },
  reaches: false,
  ...over,
});

test("green facts pass with no STOP", () => {
  const v = pushGateVerdict(facts());
  assert.deepEqual(v.stops, []);
  assert.deepEqual(v.flags, []);
});

test("a dirty tree is a FLAG, never a STOP — and it is reported as untouched", () => {
  const v = pushGateVerdict(facts({ dirty: [" M a.ts", "?? b.md"] }));
  assert.deepEqual(v.stops, []);
  assert.match(v.flags[0] ?? "", /DIRTY — 2 uncommitted entries, UNTOUCHED/);
});

test("no upstream STOPs unless the brief set it", () => {
  assert.match(pushGateVerdict(facts({ upstream: null })).stops[0] ?? "", /no upstream/);
  assert.deepEqual(pushGateVerdict(facts({ upstream: null, setUpstream: true })).stops, []);
});

test("behind the remote STOPs and routes to sync/worktree, never the push lane", () => {
  const v = pushGateVerdict(facts({ behind: 3 }));
  assert.match(v.stops[0] ?? "", /behind origin\/fix\/42-x by 3.*never to the push lane/);
});

test("a blocking label or a newest blocking verdict STOPs back to implement", () => {
  const byLabel = pushGateVerdict(
    facts({ issues: [{ ...ISSUE(), labels: ["qa:pass", "review:changes"] }] }),
  );
  assert.match(byLabel.stops[0] ?? "", /#42 carries review:changes — back to implement/);
  const byVerdict = pushGateVerdict(
    facts({
      issues: [
        {
          ...ISSUE(),
          qa: lane("blocked", "", "## 🧪 QA — BLOCKED"),
        },
      ],
    }),
  );
  assert.match(byVerdict.stops[0] ?? "", /newest QA verdict blocks/);
});

test("an unreadable issue is fail-closed; an unknown verdict word is a FLAG for a human", () => {
  assert.match(
    pushGateVerdict(facts({ issues: [{ ...ISSUE(), readable: false }] })).stops[0] ?? "",
    /could not be read/,
  );
  const v = pushGateVerdict(
    facts({
      issues: [
        {
          ...ISSUE(),
          review: lane("unknown", "", "## 🔎 REVIEW — approve (Codex)"),
        },
      ],
    }),
  );
  assert.deepEqual(v.stops, []);
  assert.match(v.flags[0] ?? "", /verdict word not recognised/);
});

/** @param {Partial<import("./issuekit-push.js").Checks>} over @returns {import("./issuekit-push.js").Checks} */
const checks = (over = {}) => ({
  kind: "pr",
  pr: 7,
  failed: [],
  pending: [],
  hard: [],
  headSha: "",
  headRel: "unknown",
  detail: "PR #7",
  ...over,
});

test("red checks STOP; pending checks FLAG a decision; no CI is a FLAG", () => {
  assert.match(
    pushGateVerdict(facts({ checks: checks({ failed: ["validate: FAILURE"] }) })).stops[0] ?? "",
    /checks RED on PR #7: validate: FAILURE/,
  );
  assert.match(
    pushGateVerdict(facts({ checks: checks({ pending: ["validate: PENDING"] }) })).flags[0] ?? "",
    /checks PENDING/,
  );
  assert.match(
    pushGateVerdict(facts({ checks: checks({ kind: "none", pr: null, detail: "no run" }) }))
      .flags[0] ?? "",
    /no CI evidence/,
  );
});

// The three cases the rollup's SHA decides. Both live overrides (PR #239 2026-11-22,
// PR #244 2026-11-24) were case 1: red at the PARENT, and the commit waiting to be pushed was
// its fix — the gate blocked the only action that could clear it.
test("a red rollup on an ANCESTOR of the pushed tip is a FLAG, never a STOP", () => {
  const v = pushGateVerdict(
    facts({
      ahead: 1,
      checks: checks({
        pr: 244,
        failed: ["API (lambda): FAILURE"],
        headSha: "04175135f0e4a1f0e2c3b4a59687d2c1f0a9b8e7",
        headRel: "ancestor",
      }),
    }),
  );
  assert.deepEqual(v.stops, []);
  const flag = v.flags[0] ?? "";
  assert.match(flag, /checks RED on PR #244: API \(lambda\): FAILURE/);
  assert.match(flag, /rollup is for 0417513/); // the rollup's SHA, named
  assert.match(flag, /strict ANCESTOR of the tip being pushed \(c86e464\)/); // and the tip
  assert.match(flag, /already has/i);
  assert.match(flag, /re-firing CI/);
});

test("a red rollup AT the pushed tip, or unrelated to it, keeps the STOP exactly as before", () => {
  for (const headRel of /** @type {const} */ (["tip", "unrelated", "unknown"])) {
    const v = pushGateVerdict(
      facts({
        checks: checks({
          pr: 244,
          failed: ["API (lambda): FAILURE"],
          headSha: "c86e464875ff1954ab987c0a60c7b45455c9f471",
          headRel,
        }),
      }),
    );
    assert.deepEqual(v.flags, [], `${headRel}: no FLAG`);
    assert.match(
      v.stops[0] ?? "",
      /checks RED on PR #244: API \(lambda\): FAILURE — the owning stage fixes; you do not push over red/,
      `${headRel}: STOPs`,
    );
  }
});

test("no red is unchanged by the ancestry, and a CONFLICTING merge STOPs whatever it is", () => {
  const green = pushGateVerdict(facts({ checks: checks({ headSha: "0417513", headRel: "ancestor" }) })); // prettier-ignore
  assert.deepEqual(green.stops, []);
  assert.deepEqual(green.flags, []);
  const pending = pushGateVerdict(
    facts({ checks: checks({ pending: ["Format: PENDING"], headRel: "ancestor" }) }),
  );
  assert.deepEqual(pending.stops, []);
  assert.match(pending.flags[0] ?? "", /checks PENDING/);
  // Not a check: no rollup SHA can explain a conflicting merge away.
  const conflict = pushGateVerdict(
    facts({
      checks: checks({
        hard: ["mergeable=CONFLICTING (needs conflict resolution)"],
        headRel: "ancestor",
      }),
    }),
  );
  assert.match(conflict.stops[0] ?? "", /mergeable=CONFLICTING.*not the push lane/);
});

test("relateHead proves the ancestry locally, and an unknown commit is never 'ancestor'", () => {
  const G = (hasShas = ["A", "B"], ancestor = true) => ({
    has: (/** @type {string} */ s) => hasShas.includes(s),
    isAncestor: () => ancestor,
  });
  assert.equal(relateHead("A", "A", G()), "tip");
  assert.equal(relateHead("c86e464875ff1954ab987c0a60c7b45455c9f471", "c86e464", G()), "tip");
  assert.equal(relateHead("A", "B", G()), "ancestor");
  assert.equal(relateHead("A", "B", G(["A", "B"], false)), "unrelated");
  assert.equal(relateHead("A", "B", G(["B"])), "unknown"); // rollup head not in this clone
  assert.equal(relateHead("", "B", G()), "unknown");
  assert.equal(relateHead("A", "", G()), "unknown");
});

test("laneVerdict reads the NEWEST verdict, whole-line pass, leading-word block, unknown otherwise", () => {
  const pass = "## 🧪 QA — PASS (re-QA)\n\nqa-verified: abc1234def";
  const block = "## QA — blocked\nnope";
  assert.deepEqual(laneVerdict("qa", [block, pass]), {
    state: "pass",
    sha: "abc1234def",
    heading: "## 🧪 QA — PASS (re-QA)",
  });
  assert.equal(laneVerdict("qa", [pass, block]).state, "blocked");
  assert.equal(
    laneVerdict("qa", ["## QA — PASS (pending deploy)\nqa-verified: abc1234"]).state,
    "unknown",
  );
  assert.equal(
    laneVerdict("review", ["## 🔎 REVIEW — approve (Codex adversarial)"]).state,
    "unknown",
  );
  assert.equal(laneVerdict("review", ["## 🔎 REVIEW (Codex) — Changes"]).state, "blocked");
  assert.equal(laneVerdict("review", ["> ## 🔎 REVIEW — changes\nquoted only"]).state, "none");
  assert.equal(laneVerdict("qa", []).state, "none");
});

test("citedIssues collects each (#N) once, in commit order", () => {
  assert.deepEqual(
    citedIssues([{ subject: "a (#5)" }, { subject: "b (#7) and (#5)" }, { subject: "c" }]),
    ["5", "7"],
  );
});
