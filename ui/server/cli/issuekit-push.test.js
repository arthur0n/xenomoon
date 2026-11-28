// The push gate's DECISION, tested without a repo or gh: facts in, STOPs/FLAGs out. The lane
// parser is checked against the same verdict shapes commit-gate.sh was taught by live issues.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  laneVerdict,
  citedIssues,
  pushGateVerdict,
  relateHead,
  publishRange,
  fetchedRange,
} from "./issuekit-push.js";

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
  howFar: "deployed",
  pipeline: true,
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
  rangeError: null,
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

/** A fake git runner: records every call, answers by the verb. `over` replaces one verb's answer.
 * @param {{ probe?: number, log?: string, counts?: string, fail?: "log" | "counts" | "probe" }} [o] */
const fakeGit = (o = {}) => {
  /** @type {string[][]} */ const calls = [];
  /** @param {string[]} args */
  const run = (args) => {
    calls.push(args);
    const verb = args[0];
    if (verb === "rev-parse") {
      if (o.fail === "probe") return { status: 128, out: "", err: "fatal: boom" };
      return { status: o.probe ?? 0, out: "", err: "" };
    }
    if (verb === "log") {
      if (o.fail === "log") return { status: 128, out: "", err: "fatal: bad range" };
      return { status: 0, out: o.log ?? "", err: "" };
    }
    if (o.fail === "counts") return { status: 1, out: "", err: "count failed" };
    return { status: 0, out: o.counts ?? "0\t0", err: "" };
  };
  return { run, calls };
};

test("publishRange: destination present lists <remote>/<branch>..HEAD and counts against it", () => {
  const g = fakeGit({ probe: 0, log: "a1\tfix: one (#1)\nb2\tfix: two (#2)\n", counts: "3\t2" });
  const r = publishRange("origin", "main", g.run);
  assert.deepEqual(g.calls[1], ["log", "refs/remotes/origin/main..HEAD", "--format=%h\t%s"]);
  assert.deepEqual(g.calls[2], ["rev-list", "--left-right", "--count", "refs/remotes/origin/main...HEAD"]); // prettier-ignore
  assert.equal(r.dest, "origin/main");
  assert.deepEqual(r.commits, [
    { sha: "a1", subject: "fix: one (#1)" },
    { sha: "b2", subject: "fix: two (#2)" },
  ]);
  assert.equal(r.behind, 3);
  assert.equal(r.ahead, 2);
  assert.equal(r.error, null);
});

test("publishRange: destination missing lists every commit on no branch of the remote, uncut", () => {
  const log = Array.from({ length: 25 }, (_, i) => `s${i}\tcommit ${i}`).join("\n");
  const g = fakeGit({ probe: 1, log });
  const r = publishRange("origin", "new-branch", g.run);
  assert.deepEqual(g.calls[1], ["log", "HEAD", "--not", "--remotes=origin", "--format=%h\t%s"]);
  assert.ok(!g.calls[1]?.includes("-n"), "no count cut");
  assert.equal(r.commits.length, 25);
  assert.equal(r.dest, null);
  assert.equal(r.ahead, null);
  assert.equal(r.behind, null);
  assert.equal(r.error, null);
  assert.equal(g.calls.length, 2, "no ahead/behind count without a destination");
});

test("publishRange: a git failure comes back as error, never as an empty range", () => {
  for (const fail of /** @type {const} */ (["probe", "log", "counts"])) {
    const r = publishRange("origin", "main", fakeGit({ probe: 0, fail }).run);
    assert.ok(r.error, `${fail}: error set`);
    assert.deepEqual(r.commits, [], `${fail}: no commits claimed`);
  }
  assert.match(publishRange("origin", "main", fakeGit({ fail: "probe" }).run).error ?? "", /boom/);
});

test("a range that cannot be listed STOPs and says so", () => {
  const v = pushGateVerdict(facts({ rangeError: "git log: fatal: bad range" }));
  assert.equal(v.stops.length, 1);
  assert.match(
    v.stops[0] ?? "",
    /cannot list the commits this push would publish \(git log: fatal: bad range\)/,
  );
});

/** `fakeGit` plus the fetch and the ls-remote answers. @param {{ fetch?: number,
 * ls?: number, probe?: number, log?: string, counts?: string }} [o] */
const fetchGit = (o = {}) => {
  const g = fakeGit(o);
  /** @param {string[]} args */
  const run = (args) => {
    if (args[0] === "fetch") {
      g.calls.push(args);
      return o.fetch ? { status: o.fetch, out: "", err: "fatal: unable to access\nmore" } : { status: 0, out: "", err: "" }; // prettier-ignore
    }
    if (args[0] === "ls-remote") {
      g.calls.push(args);
      return { status: o.ls ?? 0, out: "", err: "" };
    }
    return g.run(args);
  };
  return { run, calls: g.calls };
};

test("fetchedRange: a good fetch lists the range exactly as before", () => {
  const g = fetchGit({ probe: 0, log: "a1\tfix: one (#1)\n", counts: "0\t1" });
  const r = fetchedRange("origin", "main", g.run);
  assert.deepEqual(g.calls[0], ["fetch", "origin", "main"]);
  assert.deepEqual(g.calls[2], ["log", "refs/remotes/origin/main..HEAD", "--format=%h\t%s"]);
  assert.ok(!g.calls.some((c) => c[0] === "ls-remote"), "no ls-remote after a good fetch");
  assert.equal(r.dest, "origin/main");
  assert.deepEqual(r.commits, [{ sha: "a1", subject: "fix: one (#1)" }]);
  assert.equal(r.error, null);
});

test("fetchedRange: a failed fetch of a branch the remote does not have is a first push", () => {
  const g = fetchGit({ fetch: 128, ls: 2, probe: 1, log: "s1\tone\n" });
  const r = fetchedRange("origin", "new-branch", g.run);
  assert.deepEqual(g.calls[1], ["ls-remote", "--exit-code", "--heads", "origin", "new-branch"]);
  assert.equal(r.error, null);
  assert.equal(r.dest, null);
  assert.deepEqual(r.commits, [{ sha: "s1", subject: "one" }]);
});

test("fetchedRange: a failed fetch of an unreachable remote is an error and STOPs", () => {
  const r = fetchedRange("origin", "main", fetchGit({ fetch: 128, ls: 128, probe: 0 }).run);
  assert.equal(
    r.error,
    "could not fetch origin/main (fatal: unable to access), so the commits this push would publish cannot be listed", // prettier-ignore
  );
  assert.deepEqual(r.commits, []);
  const v = pushGateVerdict(facts({ rangeError: r.error }));
  assert.equal(v.stops.length, 1);
  assert.match(v.stops[0] ?? "", /could not fetch origin\/main/);
});

test("fetchedRange: a failed fetch of a branch the remote has is an error, never the stale ref", () => {
  const g = fetchGit({ fetch: 128, ls: 0, probe: 0, log: "a1\tstale\n" });
  const r = fetchedRange("origin", "main", g.run);
  assert.ok(r.error, "error set");
  assert.deepEqual(r.commits, []);
  assert.ok(!g.calls.some((c) => c[0] === "log"), "the stale ref is not read");
});

test("fetchedRange: a stale local ref of a deleted remote branch is not used for the range", () => {
  const g = fetchGit({ fetch: 128, ls: 2, probe: 0, log: "c3\tnew\nb2\tonly on the stale ref\n" });
  const r = fetchedRange("origin", "gone", g.run);
  assert.ok(!g.calls.some((c) => c[0] === "rev-parse"), "the stale ref is not probed");
  const log = g.calls.find((c) => c[0] === "log");
  assert.deepEqual(log, ["log", "HEAD", "--not", "--exclude=origin/gone", "--remotes=origin", "--format=%h\t%s"]); // prettier-ignore
  assert.equal(r.dest, null);
  assert.equal(r.commits.length, 2);
  assert.equal(r.error, null);
});

const DEPLOY = /** @type {const} */ ({ reaches: true });

test("how far: a deploy push passes only on deployed", () => {
  const v = pushGateVerdict(facts({ ...DEPLOY, issues: [{ ...ISSUE(), howFar: "deployed" }] }));
  assert.deepEqual(v.stops, []);
  assert.deepEqual(v.flags, []);
});

test("how far: merged, pr and unclear STOP a deploy push, naming the issue", () => {
  for (const howFar of /** @type {const} */ (["merged", "pr", "unclear"])) {
    const v = pushGateVerdict(facts({ ...DEPLOY, issues: [{ ...ISSUE(), howFar }] }));
    assert.equal(v.stops.length, 1, howFar);
    assert.match(
      v.stops[0] ?? "",
      /^Issue #42 .*so deploy is past what the owner allowed: the issue stays at state Ready/,
      howFar,
    );
  }
});

test("how far: no line STOPs when the issue shows pipeline state, FLAGs when it does not", () => {
  const stopped = pushGateVerdict(
    facts({ ...DEPLOY, issues: [{ ...ISSUE(), howFar: "none", pipeline: true }] }),
  );
  assert.equal(stopped.stops.length, 1);
  assert.match(stopped.stops[0] ?? "", /Issue #42 has no "How far" line, so deploy is past/);
  const flagged = pushGateVerdict(
    facts({ ...DEPLOY, issues: [{ ...ISSUE(), howFar: "none", pipeline: false }] }),
  );
  assert.deepEqual(flagged.stops, []);
  assert.match(flagged.flags.join("\n"), /#42 has no "How far" line and no pipeline state/);
});

test("how far: a target that cannot be told gates as deploy; a work branch is not checked", () => {
  const merged = [{ ...ISSUE(), howFar: /** @type {const} */ ("merged") }];
  const unsure = pushGateVerdict(facts({ reaches: null, issues: merged }));
  assert.equal(unsure.stops.length, 1);
  assert.match(unsure.stops[0] ?? "", /Issue #42 has "How far: merged", so deploy is past/);
  const work = pushGateVerdict(facts({ reaches: false, issues: merged }));
  assert.deepEqual(work.stops, []);
  assert.deepEqual(work.flags, []);
});

test("how far: of two issues only the one short of deployed STOPs, and an unreadable one keeps its own stop", () => {
  const two = pushGateVerdict(
    facts({
      ...DEPLOY,
      issues: [
        { ...ISSUE(), num: "1", howFar: "deployed" },
        { ...ISSUE(), num: "2", howFar: "merged" },
      ],
    }),
  );
  assert.equal(two.stops.length, 1);
  assert.match(two.stops[0] ?? "", /^Issue #2 has "How far: merged"/);
  const unreadable = pushGateVerdict(
    facts({
      ...DEPLOY,
      issues: [{ ...ISSUE(), readable: false, howFar: "none", pipeline: false }],
    }),
  );
  assert.equal(unreadable.stops.length, 1, "only the fail-closed stop, none from the contract");
  assert.match(unreadable.stops[0] ?? "", /#42 could not be read/);
  assert.deepEqual(unreadable.flags, []);
});
