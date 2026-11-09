// The browser reply branch of handleClientMessage: a reply resolves its open interaction and
// removes it through removePending, so the holder's activitySeq moves (the status endpoint, #60).
// Static imports HOIST above any statement, so the env must be set via a dynamic import chain —
// config.js resolves a domain at import time and an unbound trunk would throw before the tests run.
process.env.XENOMOON_DOMAIN ??= "webapp";
import { test, mock } from "node:test";
import assert from "node:assert/strict";
const { handleClientMessage } = await import("./session-client-messages.js");

/** @typedef {import("./connection.js").PendingHolder} PendingHolder */
/** @typedef {import("./session.js").SessionState} SessionState */

/** A holder with one open interaction (id 7) plus the minimal other deps the handler takes. */
function makeDeps() {
  const resolve = mock.fn();
  /** @type {PendingHolder} */
  const holder = {
    pending: new Map([[7, { type: "permission", resolve, msg: { type: "permission", id: 7 } }]]),
    activitySeq: 0,
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
