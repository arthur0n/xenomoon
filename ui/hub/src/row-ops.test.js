// row-ops.js with hand-held promises: nothing here renders React or waits on a clock.
import assert from "node:assert/strict";
import { test } from "node:test";
import { IDLE, makeRowOps } from "./row-ops.js";
import { POST_TIMEOUT_MS, makeHubApi } from "./hub-api.js";
import { withDeadline } from "../../server/core/http/test-deadline.js";

/** @typedef {import("./row-ops.js").OpResult} OpResult */

function held() {
  /** @type {(r: OpResult) => void} */
  let resolve = () => {};
  /** @type {Promise<OpResult>} */
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

void test("run: a second request for a busy row is not sent; another row's is", () => {
  const ops = makeRowOps();
  const first = held();
  let calls = 0;
  const call = () => {
    calls += 1;
    return first.promise;
  };
  assert.equal(ops.run("a", "stop", call), true);
  assert.equal(ops.run("a", "start", call), false);
  assert.equal(ops.run("b", "start", call), true);
  assert.deepEqual(
    [calls, ops.snapshot().get("a")?.busy, ops.snapshot().get("b")?.busy],
    [2, "stop", "start"],
  );
});

void test("run: the row stays busy until its result, then keeps the refusal by id", async () => {
  const ops = makeRowOps();
  ops.keep(["a"]);
  const p = held();
  ops.run("a", "start", () => p.promise);
  assert.deepEqual(ops.snapshot().get("a"), { busy: "start", problem: null });
  p.resolve({ ok: false, reason: "port 4101 in use" });
  await flush();
  assert.deepEqual(ops.snapshot().get("a"), {
    busy: null,
    problem: { reason: "port 4101 in use" },
  });
});

void test("run: a rejected call is a refusal in words", async () => {
  const ops = makeRowOps();
  ops.run("a", "start", () => Promise.reject(new Error("boom")));
  await flush();
  assert.deepEqual(ops.snapshot().get("a"), { busy: null, problem: { reason: "boom" } });
});

void test("run: a successful open keeps the refusal of an earlier stop", async () => {
  const ops = makeRowOps();
  ops.run("a", "stop", () => Promise.resolve({ ok: false, reason: "stop refused" }));
  await Promise.resolve();
  ops.run("a", "open", () => Promise.resolve({ ok: true }));
  await Promise.resolve();
  assert.deepEqual(ops.snapshot().get("a"), { busy: null, problem: { reason: "stop refused" } });
});

void test("run: a successful start or stop clears an earlier refusal", async () => {
  for (const kind of /** @type {const} */ (["start", "stop"])) {
    const ops = makeRowOps();
    ops.run("a", "stop", () => Promise.resolve({ ok: false, reason: "stop refused" }));
    await Promise.resolve();
    ops.run("a", kind, () => Promise.resolve({ ok: true }));
    await Promise.resolve();
    assert.deepEqual(ops.snapshot().get("a"), IDLE, kind);
  }
});

void test("keep: a row that left the list drops its result; one that came back stays busy", async () => {
  const ops = makeRowOps();
  ops.keep(["a", "b"]);
  const a = held();
  const b = held();
  ops.run("a", "stop", () => a.promise);
  ops.run("b", "stop", () => b.promise);
  ops.keep([]);
  assert.equal(ops.snapshot().get("a")?.busy, "stop", "a running request is kept while it runs");
  ops.keep(["b"]);
  assert.equal(
    ops.run("b", "start", () => b.promise),
    false,
    "b came back busy",
  );
  a.resolve({ ok: false, reason: "late" });
  await flush();
  assert.equal(ops.snapshot().has("a"), false);
  assert.equal(ops.snapshot().get("a") ?? IDLE, IDLE);
});

void test("run: a row that left while its never-settling start ran has no entry once the deadline ends it", async () => {
  /** @type {Array<() => void>} */
  const fired = [];
  const timers = {
    set: (/** @type {() => void} */ fn, /** @type {number} */ ms) => {
      assert.equal(ms, POST_TIMEOUT_MS);
      fired.push(fn);
      return fired.length;
    },
    clear: () => {},
  };
  const api = makeHubApi({ timers, fetchImpl: () => new Promise(() => {}) });
  const ops = makeRowOps();
  ops.keep(["a"]);
  await withDeadline("the store change after the deadline", (/** @type {() => void} */ res) => {
    ops.run("a", "start", () => api.startRow("a"));
    ops.keep([]);
    const stop = ops.subscribe(() => {
      stop();
      res();
    });
    fired[0]?.();
  });
  assert.equal(ops.snapshot().has("a"), false);
});

void test("subscribe: every change notifies and gives a new snapshot object", () => {
  const ops = makeRowOps();
  let n = 0;
  const stop = ops.subscribe(() => {
    n += 1;
  });
  const before = ops.snapshot();
  ops.run("a", "start", () => new Promise(() => {}));
  stop();
  ops.run("b", "start", () => new Promise(() => {}));
  assert.deepEqual([n, before === ops.snapshot()], [1, false]);
});

void test("run: a call that throws synchronously ends the request with its message and frees the row", async () => {
  const ops = makeRowOps();
  const result = ops.run("a", "open", () => {
    throw new Error("sync boom");
  });
  assert.equal(result, true);
  await Promise.resolve();
  assert.deepEqual(ops.snapshot().get("a"), { busy: null, problem: { reason: "sync boom" } });
  assert.equal(
    ops.run("a", "open", () => new Promise(() => {})),
    true,
    "the row accepts a later request",
  );
});
