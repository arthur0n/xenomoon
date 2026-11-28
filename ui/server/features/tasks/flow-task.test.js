import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STEP_IDS,
  WAITING_IDS,
  FLOW_IDS,
  OWNER_STOPS,
  DISPLAY_NAMES,
  allowedMoves,
  move,
} from "./flow-machine.js";
import { questionGate, setFlow } from "./flow-task.js";

/** @typedef {import("../../../lib/types.js").Task} Task */

const NOW = "2026-11-28T00:00:00.000Z";

/** A hand-built flow task. @param {Partial<Task> & { title: string }} over @returns {Task} */
const flowTask = (over) => ({
  id: "t1",
  owner: "agent",
  status: "pending",
  kind: "flow",
  created: NOW,
  ...over,
});

/** A task list with issue 84 placed at `id`: through setFlow where the machine allows it
 * (steps), else a hand-built flow task (waiting states). @param {string} id @returns {Task[]} */
function listAt(id) {
  if (STEP_IDS.includes(id)) {
    const r = setFlow([], { issue: 84, to: id }, NOW);
    assert.equal(r.error, undefined, `place at ${id}`);
    assert.equal(r.list[0]?.flow?.at, id);
    return r.list;
  }
  return [
    flowTask({
      title: `#84 · ${DISPLAY_NAMES[id]}`,
      flow: { issue: "84", at: id, triage: 0, fix: 0 },
    }),
  ];
}

/** A refusal: not ok, with a message. @param {ReturnType<typeof questionGate>} r */
function refused(r) {
  assert.equal(r.ok, false);
  assert.ok(!r.ok);
  assert.match(r.message, /^question refused:/);
  return r;
}

test("OWNER_STOPS is exactly the six owner stops, all known flow ids", () => {
  assert.deepEqual(
    [...OWNER_STOPS],
    [
      "direction",
      "design",
      "needs-information",
      "waiting-owner",
      "ready-not-published",
      "proof-failed",
    ],
  );
  for (const id of OWNER_STOPS) assert.ok(FLOW_IDS.includes(id), id);
  for (const id of ["publish", "waiting-proof", "done"]) assert.ok(!OWNER_STOPS.includes(id), id);
});

test("every step and waiting id: an owner stop passes, any other is refused at that id", () => {
  for (const id of [...STEP_IDS, ...WAITING_IDS]) {
    const r = questionGate(listAt(id), 84);
    if (OWNER_STOPS.includes(id)) assert.deepEqual(r, { ok: true }, id);
    else assert.equal(refused(r).at, id, id);
  }
});

test("no issue passes: undefined, null and an empty string", () => {
  const list = listAt("build");
  for (const issue of [undefined, null, ""])
    assert.deepEqual(questionGate(list, issue), { ok: true });
});

test("an issue with no open flow task passes; so does a closed one", () => {
  assert.deepEqual(questionGate([], 84), { ok: true });
  assert.deepEqual(questionGate(listAt("build"), 85), { ok: true });
  const closed = listAt("build").map((t) => ({ ...t, status: /** @type {const} */ ("done") }));
  assert.deepEqual(questionGate(closed, 84), { ok: true });
});

test('"084", 84 and "84" are one issue', () => {
  const list = listAt("build");
  for (const issue of ["084", 84, "84"])
    assert.equal(refused(questionGate(list, issue)).at, "build");
});

test("a non-numeric issue is refused and the message says it must be a number", () => {
  const r = refused(questionGate(listAt("design"), "abc"));
  assert.match(r.message, /not a number/);
  assert.equal(r.at, undefined);
});

test("a title-only flow task is read and refused; one that cannot be read passes", () => {
  const titleOnly = [flowTask({ title: "#84 · Build · triage 0/2 · fix 0/3" })];
  assert.equal(titleOnly[0]?.flow, undefined);
  assert.equal(refused(questionGate(titleOnly, 84)).at, "build");
  const unreadable = [flowTask({ title: "#84 · Nowhere at all" })];
  assert.deepEqual(questionGate(unreadable, 84), { ok: true });
});

test("an open title-only task at Done passes", () => {
  const atDone = [flowTask({ title: "#84 · Done · triage 0/2 · fix 0/3" })];
  assert.equal(atDone[0]?.flow, undefined);
  assert.deepEqual(questionGate(atDone, 84), { ok: true });
});

test("the refusal names the issue, where it is, every owner stop, and the way out", () => {
  const { message } = refused(questionGate(listAt("build"), "084"));
  assert.match(message, /#84 is at Build/);
  for (const id of OWNER_STOPS) assert.ok(message.includes(DISPLAY_NAMES[id] ?? id), id);
  assert.match(message, /waiting-owner/);
});

test("following the refusal's way out reaches an owner stop", () => {
  const refusedIds = [...STEP_IDS, ...WAITING_IDS].filter((id) => !OWNER_STOPS.includes(id));
  assert.ok(refusedIds.length > 0);
  for (const id of refusedIds) {
    const list = listAt(id);
    const state = list[0]?.flow;
    assert.ok(state, id);
    const { message } = refused(questionGate(list, 84));
    const named = [...message.matchAll(/to:"([^"]+)"/g)].map((m) => m[1] ?? "");
    assert.ok(named.length > 0, `${id}: the refusal names a move`);
    for (const to of named) assert.equal(move(state, to).error, undefined, `${id} -> ${to}`);
    const first = move(state, named[0] ?? "").state;
    assert.ok(first, id);
    assert.ok(
      OWNER_STOPS.includes(first.at) || allowedMoves(first).includes("waiting-owner"),
      `${id} -> ${first.at}: an owner stop within one more move`,
    );
  }
  // waiting-proof allows only proof; the refusal must not promise waiting-owner as the first move.
  const proofMsg = refused(questionGate(listAt("waiting-proof"), 84)).message;
  assert.match(proofMsg, /to:"proof"/);
  assert.ok(!proofMsg.includes('to:"waiting-owner"'));
  assert.equal(proofMsg.match(/to:"([^"]+)"/)?.[1], "proof");
});
