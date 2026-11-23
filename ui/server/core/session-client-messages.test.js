// The browser reply branch of handleClientMessage: a reply resolves its open interaction and
// removes it through removePending, so the holder's activitySeq moves (the status endpoint, #60).
// Static imports HOIST above any statement, so the env must be set via a dynamic import chain —
// config.js resolves a domain at import time and an unbound trunk would throw before the tests run.
process.env.XENOMOON_DOMAIN ??= "webapp";
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
// A project dir that does not exist, so the task store reads an empty board and never writes.
process.env.GAME_DIR = path.join(os.tmpdir(), `xenomoon-no-project-${process.pid}-${Date.now()}`);
const { handleClientMessage } = await import("./session-client-messages.js");
const { createChatWindow } = await import("./chat-window.js");

/** @typedef {import("./session-client-messages.js").PendingHolder} PendingHolder */
/** @typedef {import("./session.js").SessionState} SessionState */

/** A holder with one open interaction (id 7) plus the minimal other deps the handler takes. */
function makeDeps() {
  const resolve = mock.fn();
  /** @type {PendingHolder} */
  const holder = {
    pending: new Map([[7, { type: "permission", resolve, msg: { type: "permission", id: 7 } }]]),
    activitySeq: 0,
    chat: createChatWindow(),
  };
  const deps = {
    log: mock.fn(),
    send: mock.fn(),
    inbox: { push: mock.fn() },
    holder,
    session: /** @type {SessionState} */ (/** @type {unknown} */ ({})),
  };
  return { deps, holder, resolve };
}

/** @param {number} id @param {unknown} payload */
const reply = (id, payload) => Buffer.from(JSON.stringify({ type: "reply", id, payload }));

test("a reply for a known id resolves with the payload, removes the entry and raises activitySeq", () => {
  const { deps, holder, resolve } = makeDeps();
  handleClientMessage(reply(7, { allow: true }), deps);
  assert.equal(resolve.mock.callCount(), 1);
  assert.deepEqual(resolve.mock.calls[0]?.arguments, [{ allow: true }]);
  assert.equal(holder.pending.has(7), false);
  assert.ok(holder.activitySeq > 0);
});

test("a reply for an unknown id leaves pending and activitySeq unchanged", () => {
  const { deps, holder, resolve } = makeDeps();
  handleClientMessage(reply(99, { allow: true }), deps);
  assert.equal(resolve.mock.callCount(), 0);
  assert.deepEqual([...holder.pending.keys()], [7]);
  assert.equal(holder.activitySeq, 0);
});

/** @param {unknown} m */
const raw = (m) => Buffer.from(JSON.stringify(m));

test("a user_input adds its trimmed text to the chat window as a user item", () => {
  const { deps, holder } = makeDeps();
  handleClientMessage(raw({ type: "user_input", text: " hi " }), deps);
  assert.deepEqual(holder.chat.items(), [{ role: "user", text: "hi" }]);
});

test("a user_input with empty or whitespace text adds no chat item", () => {
  const { deps, holder } = makeDeps();
  handleClientMessage(raw({ type: "user_input", text: "" }), deps);
  handleClientMessage(raw({ type: "user_input", text: "  \n " }), deps);
  assert.deepEqual(holder.chat.items(), []);
});

test("a reply and a compact add no chat item", () => {
  const { deps, holder } = makeDeps();
  handleClientMessage(reply(7, { allow: true }), deps);
  handleClientMessage(raw({ type: "compact" }), deps);
  assert.deepEqual(holder.chat.items(), []);
});

const { validCid } = await import("./session-client-messages.js");
const CID = "a1b2-C3_d4";

/** The user_ack messages the handler sent. @param {{ send: { mock: { calls: { arguments: unknown[] }[] } } }} deps
 * @returns {unknown[]} */
const acksSent = (deps) =>
  deps.send.mock.calls
    .map((c) => c.arguments[0])
    .filter((m) => /** @type {{ type?: string }} */ (m)?.type === "user_ack");

test("a user_input with a valid cid records it in the window item and sends one user_ack after queueing the turn", () => {
  const { deps, holder } = makeDeps();
  const order = /** @type {string[]} */ ([]);
  deps.inbox.push.mock.mockImplementation(() => {
    order.push("push");
  });
  deps.send.mock.mockImplementation((/** @type {{ type: string }} */ m) => {
    if (m.type === "user_ack") order.push("ack");
  });
  handleClientMessage(raw({ type: "user_input", text: " hi ", cid: CID }), deps);
  assert.deepEqual(holder.chat.items(), [{ role: "user", text: "hi", cid: CID }]);
  assert.equal(deps.inbox.push.mock.callCount(), 1);
  assert.deepEqual(acksSent(deps), [{ type: "user_ack", cid: CID }]);
  assert.deepEqual(order, ["push", "ack"]);
});

test("a user_input without a cid is accepted, its item has no cid and no ack goes out", () => {
  const { deps, holder } = makeDeps();
  handleClientMessage(raw({ type: "user_input", text: "hi" }), deps);
  assert.equal(deps.inbox.push.mock.callCount(), 1);
  assert.deepEqual(holder.chat.items(), [{ role: "user", text: "hi" }]);
  assert.deepEqual(acksSent(deps), []);
});

test("a user_input with an invalid cid is accepted, its item has no cid and no ack goes out", () => {
  for (const bad of /** @type {unknown[]} */ (["x".repeat(65), "a b", "a/b", "é", 42, ""])) {
    const { deps, holder } = makeDeps();
    handleClientMessage(raw({ type: "user_input", text: "hi", cid: bad }), deps);
    assert.equal(deps.inbox.push.mock.callCount(), 1, String(bad));
    assert.deepEqual(holder.chat.items(), [{ role: "user", text: "hi" }], String(bad));
    assert.deepEqual(acksSent(deps), [], String(bad));
  }
});

test("an image-only user_input with a valid cid is acked and adds no window item", () => {
  const { deps, holder } = makeDeps();
  const images = [{ media_type: "image/png", data: "AAAA" }];
  handleClientMessage(raw({ type: "user_input", text: "", images, cid: CID }), deps);
  assert.equal(deps.inbox.push.mock.callCount(), 1);
  assert.deepEqual(holder.chat.items(), []);
  assert.deepEqual(acksSent(deps), [{ type: "user_ack", cid: CID }]);
});

test("validCid accepts 1-64 characters of [A-Za-z0-9_-] and nothing else", () => {
  /** @type {[unknown, string | undefined][]} */
  const table = [
    ["a", "a"],
    ["x".repeat(64), "x".repeat(64)],
    ["550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440000"],
    ["A_b-9", "A_b-9"],
    ["", undefined],
    ["x".repeat(65), undefined],
    ["a b", undefined],
    ["a.b", undefined],
    ["a\n", undefined],
    [42, undefined],
    [null, undefined],
    [undefined, undefined],
    [{}, undefined],
  ];
  for (const [input, want] of table) assert.equal(validCid(input), want, String(input));
});
