import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STEP_IDS,
  FLOW_IDS,
  FIX_LIMIT,
  TRIAGE_LIMIT,
  start,
  move,
  allowedMoves,
  title,
  fromLegacyTitle,
} from "./flow-machine.js";

/** @typedef {import("../../../lib/types.js").FlowState} FlowState */
/** @typedef {{ state?: FlowState, error?: string, done?: boolean }} MoveResult */

/** @param {Partial<FlowState>} over @returns {FlowState} */
const at = (over) => ({ issue: "84", at: "screening", triage: 0, fix: 0, ...over });

/** The accepted (or forced) state of a result. @param {MoveResult} r @returns {FlowState} */
function ok(r) {
  assert.ok(r.state, r.error);
  return r.state;
}

/** @param {FlowState | null} s @returns {FlowState} */
function read(s) {
  assert.ok(s);
  return s;
}

/** Walk a path of moves; every step must be accepted. @param {FlowState} s @param {string[]} path */
function walk(s, path) {
  for (const to of path) {
    const r = move(s, to);
    assert.equal(r.error, undefined, `${s.at} → ${to}`);
    s = ok(r);
  }
  return s;
}

/** A refusal: no state, the text says refused and lists the allowed moves.
 * @param {MoveResult} r @param {readonly string[]} allowed */
function assertRefused(r, allowed) {
  assert.equal(r.state, undefined);
  assert.match(r.error ?? "", /refused/);
  assert.match(r.error ?? "", new RegExp(`Allowed: ${allowed.join(", ")}\\.`));
}

const WAIT = "waiting-owner";
/** The table of the dispatch, written out independently of FLOW_TABLE.
 * @type {Array<[string, string, { triage?: number, fix?: number }?]>} */
const EDGES = [
  ["screening", "direction"],
  ["screening", "needs-information"],
  ["direction", "triage", { triage: 1 }],
  ["direction", "contract"],
  ["direction", "needs-information"],
  ["triage", "direction"],
  ["contract", "design"],
  ["design", "plan"],
  ["plan", "build"],
  ["build", "review"],
  ["review", "fix", { fix: 1 }],
  ["review", "commit"],
  ["fix", "fix", { fix: 1 }],
  ["fix", "commit"],
  ["commit", "publish"],
  ["commit", "fix", { fix: 1 }],
  ["publish", "waiting-proof"],
  ["publish", "ready-not-published"],
  ["ready-not-published", "publish"],
  ["waiting-proof", "proof"],
  ["proof", "proof-failed"],
  ["proof", "waiting-proof"],
  ["proof-failed", "fix", { fix: 1 }],
  ["proof-failed", WAIT],
  ...STEP_IDS.map((s) => /** @type {[string, string]} */ ([s, WAIT])),
];

test("every table edge is accepted, counted edges raise their counter", () => {
  for (const [from, to, raised = {}] of EDGES) {
    const s = ok(move(at({ at: from }), to));
    assert.equal(s.at, to);
    assert.equal(s.triage, raised.triage ?? 0, `${from} → ${to} triage`);
    assert.equal(s.fix, raised.fix ?? 0, `${from} → ${to} fix`);
  }
});

test("refusals return no state and list the allowed moves", () => {
  /** @type {Array<[string, string, string[]]>} */
  const cases = [
    ["screening", "build", ["direction", "needs-information", WAIT]],
    ["triage", "contract", ["direction", WAIT]],
    ["review", "publish", ["fix", "commit", WAIT]],
    ["fix", "design", ["fix", "commit", WAIT]],
    ["ready-not-published", "proof", ["publish"]],
    ["waiting-proof", "done", ["proof"]],
  ];
  for (const [from, to, allowed] of cases) {
    const r = move(at({ at: from }), to);
    assertRefused(r, allowed);
    assert.match(r.error ?? "", /#84 is at /);
  }
});

test("an unknown id is refused with the list of valid ids", () => {
  const r = move(at({}), "deploy");
  assert.equal(r.state, undefined);
  assert.match(r.error ?? "", /unknown id/);
  assert.match(r.error ?? "", new RegExp(FLOW_IDS.join(", ")));
});

test("triage budget: the third visit forces Needs information from Direction", () => {
  const s = walk(at({}), ["direction", "triage", "direction", "triage", "direction"]);
  assert.equal(s.triage, TRIAGE_LIMIT);
  const r = move(s, "triage");
  assert.match(r.error ?? "", /triage budget is used \(2\/2\)/);
  assert.match(r.error ?? "", /now waits in Needs information \(from Direction\)/);
  assert.deepEqual(r.state, { ...s, at: "needs-information", from: "direction" });
});

test("fix budget: a fourth round from review, fix, commit or proof-failed forces Waiting for the owner", () => {
  for (const from of ["review", "fix", "commit", "proof-failed"]) {
    const r = move(at({ at: from, fix: FIX_LIMIT, redesigned: true }), "fix");
    assert.match(r.error ?? "", /fix budget is used \(3\/3\)/, from);
    assert.match(r.error ?? "", /now waits in Waiting for the owner \(from /, from);
    const s = ok(r);
    assert.equal(s.at, WAIT);
    assert.equal(s.from, from);
    assert.equal(s.fix, FIX_LIMIT);
  }
});

test("fix rounds count once per call: review → fix → fix → fix is round 3", () => {
  const s = walk(at({ at: "review" }), ["fix", "fix", "fix"]);
  assert.equal(s.fix, 3);
  assert.equal(ok(move(s, "fix")).at, WAIT);
});

test("return from Waiting for the owner to fix at round 3 is not counted; the next round is refused", () => {
  const forced = ok(move(at({ at: "fix", fix: 3, redesigned: true }), "fix"));
  const back = ok(move(forced, "fix"));
  assert.equal(back.at, "fix");
  assert.equal(back.fix, 3);
  assert.equal(back.from, undefined);
  const again = move(back, "fix");
  assert.ok(again.error);
  assert.equal(ok(again).at, WAIT);
});

test("fix → design only at round 3, only once, and sets redesigned", () => {
  assertRefused(move(at({ at: "fix", fix: 2 }), "design"), ["fix", "commit", WAIT]);
  const s = ok(move(at({ at: "fix", fix: 3 }), "design"));
  assert.equal(s.at, "design");
  assert.equal(s.redesigned, true);
  assert.equal(s.fix, 3);
  const again = walk(s, ["plan", "build", "review"]);
  assert.equal(again.fix, 3, "counters unchanged through design after round 3");
  const forced = ok(move(again, "fix"));
  assert.equal(forced.at, WAIT, "after the redesign, a still-open finding waits for the owner");
  assert.equal(forced.from, "review");
  const refused = move({ ...again, at: "fix" }, "design");
  assertRefused(refused, ["fix", "commit", WAIT]);
  assert.match(refused.error ?? "", /only in round 3\/3 and only once/);
});

test("waiting states keep the counters and return only to `from`", () => {
  const s = at({ at: "review", triage: 1, fix: 2 });
  const wait = ok(move(s, WAIT));
  assert.equal(wait.from, "review");
  assertRefused(move(wait, "commit"), ["review"]);
  assert.deepEqual(ok(move(wait, "review")), s);
  const info = ok(move(at({ at: "direction", triage: 2 }), "needs-information"));
  assert.equal(info.from, "direction");
  assertRefused(move(info, "screening"), ["direction"]);
  assert.equal(ok(move(info, "direction")).triage, 2);
});

test("done only from proof, with done: true", () => {
  const r = move(at({ at: "proof", fix: 1 }), "done");
  assert.equal(r.done, true);
  assert.equal(ok(r).at, "done");
  for (const from of ["publish", "waiting-proof", "proof-failed", "commit"]) {
    const no = move(at({ at: from }), "done");
    assert.equal(no.state, undefined, from);
    assert.equal(no.done, undefined, from);
  }
  assertRefused(move(ok(r), "proof"), ["none"]);
});

test("start: screening by default, placed at a later step, refusals", () => {
  assert.deepEqual(start("84").state, { issue: "84", at: "screening", triage: 0, fix: 0 });
  assert.deepEqual(start("084", "screening").state, at({}));
  assert.deepEqual(start("84", "review").state, at({ at: "review", placed: "review" }));
  for (const bad of ["waiting-owner", "proof-failed", "done", "nowhere"]) {
    const r = start("84", bad);
    assert.equal(r.state, undefined, bad);
    assert.match(r.error ?? "", /not a step/, bad);
  }
  for (const bad of ["#84", "8a", ""]) {
    const r = start(bad);
    assert.equal(r.state, undefined, bad);
    assert.match(r.error ?? "", /not a number/);
  }
});

test("title renders step, waiting origin, counters and placement", () => {
  assert.equal(title(at({ at: "design", triage: 1 })), "#84 · Design · triage 1/2 · fix 0/3");
  assert.equal(
    title(at({ at: "review", placed: "review" })),
    "#84 · Review · triage 0/2 · fix 0/3 · placed at Review",
  );
  assert.equal(
    title(at({ at: WAIT, from: "fix", fix: 3 })),
    "#84 · Waiting for the owner (from Fix) · triage 0/2 · fix 3/3",
  );
});

test("fromLegacyTitle reads hand-written titles", () => {
  assert.deepEqual(
    fromLegacyTitle("#84 · Design · triage 1/2 · fix 0/3 · agents 5"),
    at({ at: "design", triage: 1 }),
  );
  assert.deepEqual(
    fromLegacyTitle("#08 · Waiting for the owner · triage 2/2 · fix 3/3"),
    at({ issue: "8", at: WAIT, triage: 2, fix: 3 }),
  );
  assert.deepEqual(fromLegacyTitle("#12 · proof failed"), at({ issue: "12", at: "proof-failed" }));
  const s = at({ at: WAIT, from: "fix", fix: 3, placed: "review" });
  assert.deepEqual(fromLegacyTitle(title(s)), s);
  for (const bad of ["84 · Design", "#84 · Deploy · fix 0/3", "#84", "Design · triage 1/2"]) {
    assert.equal(fromLegacyTitle(bad), null, bad);
  }
});

test("a legacy waiting state without `from` accepts any step as the return, once", () => {
  const s = read(fromLegacyTitle("#08 · Waiting for the owner · triage 2/2 · fix 3/3"));
  assert.deepEqual(allowedMoves(s), [...STEP_IDS]);
  const back = ok(move(s, "commit"));
  assert.equal(back.at, "commit");
  assert.equal(back.fix, 3);
  const again = ok(move(back, WAIT));
  assertRefused(move(again, "build"), ["commit"]);
  assertRefused(move(s, "waiting-proof"), STEP_IDS);
});

test("placement at a counted step is its first visit / first round: no free extra one", () => {
  const t = ok(start("84", "triage"));
  assert.equal(t.triage, 1);
  const r = move(walk(t, ["direction", "triage", "direction"]), "triage");
  assert.match(r.error ?? "", /triage budget is used \(2\/2\)/);
  assert.equal(ok(r).at, "needs-information");
  const f = ok(start("84", "fix"));
  assert.equal(f.fix, 1);
  const g = move(walk(f, ["fix", "fix"]), "fix");
  assert.match(g.error ?? "", /fix budget is used \(3\/3\)/);
  assert.equal(ok(g).at, WAIT);
});

test("done only from proof: a legacy origin of Done is not kept and never closes the issue", () => {
  const s = read(fromLegacyTitle("#84 · Waiting for the owner (from Done) · triage 2/2 · fix 3/3"));
  assert.equal(s.from, undefined);
  assert.ok(!allowedMoves(s).includes("done"));
  const r = move(s, "done");
  assert.equal(r.done, undefined);
  assertRefused(r, STEP_IDS);
  // A state built by hand with an impossible origin is refused too.
  assert.deepEqual(allowedMoves(at({ at: WAIT, from: "done" })), [...STEP_IDS]);
  const forged = move(at({ at: WAIT, from: "done" }), "done");
  assert.equal(forged.done, undefined);
  assert.equal(forged.state, undefined);
  assert.equal(
    read(fromLegacyTitle("#84 · Waiting for the owner (from Proof failed)")).from,
    "proof-failed",
  );
});

test("legacy counters: over the limit clamps, negative or not a number reads 0", () => {
  const s = read(fromLegacyTitle("#84 · Fix · triage 7/2 · fix 9/3"));
  assert.equal(s.triage, TRIAGE_LIMIT);
  assert.equal(s.fix, FIX_LIMIT);
  const z = read(fromLegacyTitle("#84 · Fix · triage -1/2 · fix x/3"));
  assert.equal(z.triage, 0);
  assert.equal(z.fix, 0);
});

test("counters never decrease along a full run", () => {
  const path = ["direction", "triage", "direction", "contract", "design", "plan", "build"];
  const tail = ["review", "fix", "commit", "publish", "waiting-proof", "proof", "proof-failed"];
  let s = ok(start("84"));
  let last = { triage: 0, fix: 0 };
  for (const to of [...path, ...tail, "fix", "commit", "publish", "waiting-proof", "proof"]) {
    s = walk(s, [to]);
    assert.ok(s.triage >= last.triage && s.fix >= last.fix, to);
    last = { triage: s.triage, fix: s.fix };
  }
  assert.deepEqual(last, { triage: 1, fix: 2 });
  assert.equal(move(s, "done").done, true);
});
