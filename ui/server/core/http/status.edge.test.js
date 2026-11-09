// Status edge cases (#60 row 6b): recency across insertion order, teardown of a waiting session,
// and an abnormal stream end — each driven through the real writers (addPending, teardown,
// runWithRetry) rather than hard-coded numbers. Dynamic imports: config.js resolves a domain.
process.env.XENOMOON_DOMAIN ??= "webapp";
import { test, mock } from "node:test";
import assert from "node:assert/strict";
const { statusPayload } = await import("./status.js");
const { addPending, removePending, teardown } = await import("../connection.js");
const { trackSession, liveSessions, nextActivity } = await import("../registry.js");
const { runWithRetry } = await import("../stream.js");

/** @typedef {import("../connection.js").LiveSession} LiveSession */
/** @typedef {import("../stream.js").SDKMessage} SDKMessage */

const ENV = { name: "demo", path: "/p/demo", domain: "webapp", port: 3117, pid: 42 };
const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);

/** A LiveSession fake with what statusPayload reads plus what teardown touches.
 * @param {string} lastLine @returns {LiveSession} */
function fake(lastLine) {
  return /** @type {LiveSession} */ (
    /** @type {unknown} */ ({
      id: null,
      conn: { socket: null, buffer: [] },
      inbox: { close: mock.fn() },
      pending: new Map(),
      abort: new AbortController(),
      session: {},
      busy: { value: false },
      endLog: mock.fn(),
      graceTimer: null,
      done: false,
      lastLine,
      runningAgents: 0,
      activitySeq: 0,
    })
  );
}

/** Stamp activity through the real writers: a pending add then remove bumps the session's seq. */
/** @param {LiveSession} ls */
function touch(ls) {
  addPending(ls, 1, { type: "ask", resolve: () => {}, msg: { type: "ask", id: 1 } });
  removePending(ls, 1);
}

test("lastLine follows recency, not insertion order", () => {
  const a = fake("from A");
  const b = fake("from B");
  touch(a);
  touch(b); // B is the later activity
  assert.equal(statusPayload([a, b], NOW, ENV).lastLine, "from B");
  const c = fake("from A");
  const d = fake("from B");
  touch(d);
  touch(c); // same insertion order [c, d], opposite history
  assert.equal(statusPayload([c, d], NOW, ENV).lastLine, "from A");
});

test("a torn-down waiting session leaves liveSessions and no longer makes the status waiting", () => {
  const ls = fake("x");
  trackSession(ls);
  addPending(ls, 1, { type: "ask", resolve: () => {}, msg: { type: "ask", id: 1 } });
  assert.equal(statusPayload(liveSessions(), NOW, ENV).state, "waiting");
  teardown(ls);
  assert.equal(liveSessions().includes(ls), false);
  assert.equal(ls.pending.size, 0);
  assert.equal(statusPayload(liveSessions(), NOW, ENV).state, "idle");
});

test("a stream that throws after an assistant message propagates and keeps activity consistent", async () => {
  const act = { lastLine: "", runningAgents: 0, activitySeq: nextActivity() };
  const before = act.activitySeq;
  const busy = { value: false };
  /** @type {Map<string, import("../../../lib/types.js").RunningAgentWire>} */
  const runningByTask = new Map();
  const msg = /** @type {SDKMessage} */ (
    /** @type {unknown} */ ({
      type: "assistant",
      message: { content: [{ type: "text", text: "partial" }] },
      parent_tool_use_id: null,
    })
  );
  await assert.rejects(
    runWithRetry({
      makeQuery: () =>
        /** @type {any} */ ({
          async *[Symbol.asyncIterator]() {
            yield msg;
            throw new Error("boom");
          },
        }),
      trackMessage: () => {},
      trackDeps: {
        agentByTool: new Map(),
        bgSpawns: new Set(),
        bgBoard: new Map(),
        runningByTask,
        send: () => {},
      },
      send: () => {},
      abort: new AbortController(),
      busy,
      session: {},
      inbox: { push: () => {} },
      resumeId: null,
      activity: act,
    }),
    /boom/,
  );
  assert.equal(act.lastLine, "partial");
  assert.ok(act.activitySeq > before);
  assert.equal(act.runningAgents, runningByTask.size);
  // FINDING: runWithRetry does not reset busy on a throw; the caller's terminal teardown untracks
  // the session instead. Pinned as the current behaviour, not endorsed.
  assert.equal(busy.value, true);
});
