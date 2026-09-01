// The detach/grace/teardown lifecycle — the seam that keeps sub-agents alive across a browser
// disconnect. Pure-state tests over hand-built LiveSession objects (no server, no SDK): the
// decisions here are where a wrong answer kills in-flight work.
// Static imports HOIST above any statement, so the env must be set via a dynamic import chain —
// config.js resolves a domain at import time and an unbound trunk would throw before the tests run.
process.env.XENOMOON_DOMAIN ??= "webapp";
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { parseJSON } from "../../lib/json.js";
const { evaluateGrace, teardown, onSocketDetach, replayPending, flushBuffer, makeWaitFor } =
  await import("./connection.js");

/** @typedef {import("./connection.js").LiveSession} LiveSession */
/** @typedef {import("../../lib/types.js").OutMsg} OutMsg */
/** @typedef {import("ws").WebSocket} WebSocket */

/** A minimal LiveSession the lifecycle functions accept, plus handles on its mock fns.
 * @returns {{ ls: LiveSession, closeInbox: ReturnType<typeof mock.fn>, endLog: ReturnType<typeof mock.fn> }} */
function makeLs() {
  const closeInbox = mock.fn();
  const endLog = mock.fn();
  const ls = /** @type {LiveSession} */ (
    /** @type {unknown} */ ({
      id: "sess-1",
      conn: { socket: null, buffer: [] },
      inbox: { close: closeInbox },
      pending: new Map(),
      abort: new AbortController(),
      session: {},
      busy: { value: false },
      send: () => {},
      log: () => {},
      endLog,
      graceTimer: null,
      announced: true,
      done: false,
      resync: () => {},
    })
  );
  return { ls, closeInbox, endLog };
}

/** A socket double: OPEN, records what it was sent.
 * @returns {{ ws: WebSocket, sent: string[] }} */
function makeSocket() {
  /** @type {string[]} */
  const sent = [];
  const ws = /** @type {WebSocket} */ (
    /** @type {unknown} */ ({
      readyState: 1,
      OPEN: 1,
      send: (/** @type {string} */ s) => sent.push(s),
    })
  );
  return { ws, sent };
}

test("evaluateGrace: detached+idle arms the reaper; attached or busy cancels it", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { ls } = makeLs();
  evaluateGrace(ls); // detached, idle → timer armed
  assert.notEqual(ls.graceTimer, null);
  ls.busy.value = true;
  evaluateGrace(ls); // a turn started mid-grace → timer cancelled, session kept
  assert.equal(ls.graceTimer, null);
  ls.busy.value = false;
  ls.conn.socket = makeSocket().ws;
  evaluateGrace(ls); // attached → no timer either
  assert.equal(ls.graceTimer, null);
  ls.conn.socket = null;
  evaluateGrace(ls);
  t.mock.timers.tick(75_000); // idle grace expires → teardown fires
  assert.equal(ls.done, true);
  assert.equal(ls.abort.signal.aborted, true);
});

test("teardown: settles pending, aborts, idempotent", () => {
  const { ls, closeInbox, endLog } = makeLs();
  /** @type {unknown[]} */
  const replies = [];
  ls.pending.set(1, {
    type: "permission",
    resolve: (/** @type {unknown} */ v) => replies.push(v),
    msg: /** @type {OutMsg} */ ({}),
  });
  ls.pending.set(2, {
    type: "form",
    resolve: (/** @type {unknown} */ v) => replies.push(v),
    msg: /** @type {OutMsg} */ ({}),
  });
  teardown(ls);
  teardown(ls); // second call must be a no-op
  assert.deepEqual(replies, [{ allow: false }, { cancelled: true }]);
  assert.equal(ls.pending.size, 0);
  assert.equal(closeInbox.mock.callCount(), 1);
  assert.equal(endLog.mock.callCount(), 1);
  assert.equal(ls.abort.signal.aborted, true);
});

test("onSocketDetach: nulls the socket only for the CURRENT socket — a stale close is a no-op", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { ls } = makeLs();
  const oldWs = makeSocket().ws;
  const newWs = makeSocket().ws;
  ls.conn.socket = newWs;
  onSocketDetach(oldWs, ls); // stale close from a replaced socket
  assert.equal(ls.conn.socket, newWs);
  assert.equal(ls.graceTimer, null);
  onSocketDetach(newWs, ls); // the real detach
  assert.equal(ls.conn.socket, null);
  assert.notEqual(ls.graceTimer, null);
});

test("waitFor keeps the wire message; replayPending re-sends open cards", async () => {
  /** @type {import("./connection.js").Pending} */
  const pending = new Map();
  /** @type {OutMsg[]} */
  const out = [];
  const waitFor = makeWaitFor((o) => out.push(o), pending);
  const p = waitFor("permission", { toolName: "Bash" });
  assert.equal(out.length, 1);
  const { ls } = makeLs();
  ls.pending = pending;
  ls.send = (o) => out.push(o);
  replayPending(ls); // a re-attached client gets the SAME card again
  assert.deepEqual(out[1], out[0]);
  pending.get(1)?.resolve({ allow: true });
  assert.deepEqual(await p, { allow: true });
});

test("flushBuffer: drains in order to an OPEN socket, else leaves the buffer", () => {
  const { ls } = makeLs();
  ls.conn.buffer = /** @type {OutMsg[]} */ ([{ type: "a" }, { type: "b" }]);
  flushBuffer(ls); // no socket → untouched
  assert.equal(ls.conn.buffer.length, 2);
  const { ws, sent } = makeSocket();
  ls.conn.socket = ws;
  flushBuffer(ls);
  assert.deepEqual(
    sent.map((s) => /** @type {{ type: string }} */ (parseJSON(s)).type),
    ["a", "b"],
  );
  assert.equal(ls.conn.buffer.length, 0);
});
