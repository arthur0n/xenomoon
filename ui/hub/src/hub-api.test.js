// hub-api.js with fakes only: EventSource, fetch and timers are injected, so nothing here opens a
// socket or waits on a clock.
import assert from "node:assert/strict";
import { test } from "node:test";
import { POST_TIMEOUT_MS, RETRY_MAX_MS, RETRY_MIN_MS, STREAM_URL, makeHubApi } from "./hub-api.js";
import { withDeadline } from "../../server/core/http/test-deadline.js";

/** @typedef {import("./hub-api.js").HubSnapshot} HubSnapshot */

function fakeSources() {
  /** @type {FakeSource[]} */
  const all = [];
  class FakeSource {
    /** @type {((ev: MessageEvent) => void) | null} */
    onmessage = null;
    /** @type {((ev: Event) => void) | null} */
    onerror = null;
    closed = false;
    /** @param {string} url */
    constructor(url) {
      this.url = url;
      all.push(this);
    }
    close() {
      this.closed = true;
    }
    /** @param {unknown} data */
    emit(data) {
      this.onmessage?.(new MessageEvent("message", { data }));
    }
    fail() {
      this.onerror?.(new Event("error"));
    }
  }
  return { Ctor: FakeSource, all };
}

function fakeTimers() {
  /** @type {Map<number, { fn: () => void, ms: number }>} */
  const pending = new Map();
  let next = 1;
  return {
    pending,
    timers: {
      /** @param {() => void} fn @param {number} ms */
      set: (fn, ms) => {
        pending.set(next, { fn, ms });
        return next++;
      },
      /** @param {unknown} id */
      clear: (id) => {
        pending.delete(/** @type {number} */ (id));
      },
    },
    /** Runs the one pending timer and returns its delay. */
    runOne() {
      const [id, t] = [...pending][0] ?? [];
      assert.ok(id !== undefined && t, "a timer is pending");
      pending.delete(id);
      t.fn();
      return t.ms;
    },
  };
}

/** @param {Array<{ status: number, body: string } | Error>} answers */
function fakeFetch(answers) {
  /** @type {Array<{ url: string, method: string }>} */
  const calls = [];
  /** @param {string} url @param {{ method: string }} init */
  const fetchImpl = (url, init) => {
    calls.push({ url, method: init.method });
    const a = answers.shift();
    if (!a) return Promise.reject(new Error("no answer left"));
    if (a instanceof Error) return Promise.reject(a);
    return Promise.resolve({ status: a.status, text: () => Promise.resolve(a.body) });
  };
  return { fetchImpl, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const view = (/** @type {object[]} */ rows) => JSON.stringify({ rows, errors: [], at: "t" });
const OFF = { id: "alpha/a b", state: "off", port: 4101 };
const ON = { ...OFF, state: "on" };

void test("subscribe: an event gives the rows and connection live", () => {
  const { Ctor, all } = fakeSources();
  const api = makeHubApi({ EventSourceImpl: Ctor, timers: fakeTimers().timers });
  /** @type {HubSnapshot[]} */
  const seen = [];
  api.subscribe((s) => seen.push(s));
  assert.equal(all[0]?.url, STREAM_URL);
  all[0]?.emit(view([ON]));
  assert.deepEqual(seen, [{ rows: [ON], errors: [], connection: "live" }]);
});

void test("subscribe: an error closes the source, says reconnecting, reconnects after the delay", () => {
  const { Ctor, all } = fakeSources();
  const t = fakeTimers();
  /** @type {HubSnapshot[]} */
  const seen = [];
  makeHubApi({ EventSourceImpl: Ctor, timers: t.timers }).subscribe((s) => seen.push(s));
  all[0]?.emit(view([ON]));
  all[0]?.fail();
  assert.equal(all[0]?.closed, true);
  assert.deepEqual(seen.at(-1), { rows: [ON], errors: [], connection: "reconnecting" });
  assert.equal(all.length, 1, "no reconnect before the delay");
  assert.equal(t.runOne(), RETRY_MIN_MS);
  assert.equal(all.length, 2);
});

void test("subscribe: the delay doubles up to the cap and a good event resets it", () => {
  const { Ctor, all } = fakeSources();
  const t = fakeTimers();
  makeHubApi({ EventSourceImpl: Ctor, timers: t.timers }).subscribe(() => {});
  /** @type {number[]} */
  const delays = [];
  for (let i = 0; i < 6; i++) {
    all.at(-1)?.fail();
    delays.push(t.runOne());
  }
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, RETRY_MAX_MS, RETRY_MAX_MS]);
  all.at(-1)?.emit(view([]));
  all.at(-1)?.fail();
  assert.equal(t.runOne(), RETRY_MIN_MS);
});

void test("subscribe: a malformed event is ignored and the next good one arrives", () => {
  const { Ctor, all } = fakeSources();
  const t = fakeTimers();
  /** @type {HubSnapshot[]} */
  const seen = [];
  makeHubApi({ EventSourceImpl: Ctor, timers: t.timers }).subscribe((s) => seen.push(s));
  all[0]?.emit("{not json");
  all[0]?.emit(JSON.stringify({ rows: [{ id: 1 }] }));
  all[0]?.emit(view([OFF]));
  assert.deepEqual(seen, [{ rows: [OFF], errors: [], connection: "live" }]);
  assert.equal(all[0]?.closed, false);
  assert.equal(t.pending.size, 0);
});

void test("subscribe: the returned function closes the source and cancels the pending reconnect", () => {
  const { Ctor, all } = fakeSources();
  const t = fakeTimers();
  const close = makeHubApi({ EventSourceImpl: Ctor, timers: t.timers }).subscribe(() => {});
  all[0]?.fail();
  assert.equal(t.pending.size, 1);
  close();
  assert.equal(t.pending.size, 0);
  const close2 = makeHubApi({ EventSourceImpl: Ctor, timers: t.timers }).subscribe(() => {});
  close2();
  assert.equal(all[1]?.closed, true);
});

void test("startRow / stopRow: POST to the encoded id, ok on 200", async () => {
  const ok = { status: 200, body: JSON.stringify({ ok: true, code: 200, state: "on" }) };
  const { fetchImpl, calls } = fakeFetch([ok, ok]);
  const t = fakeTimers();
  const api = makeHubApi({ fetchImpl, timers: t.timers });
  assert.deepEqual(await api.startRow("alpha/a b"), { ok: true });
  assert.deepEqual(await api.stopRow("alpha/a b"), { ok: true });
  assert.equal(t.pending.size, 0, "the deadline timer is cleared once the answer is read");
  assert.deepEqual(calls, [
    { url: "/api/hub/rows/alpha%2Fa%20b/start", method: "POST" },
    { url: "/api/hub/rows/alpha%2Fa%20b/stop", method: "POST" },
  ]);
});

void test("startRow: a 409 and a 403 come back as refusals in words", async () => {
  const { fetchImpl } = fakeFetch([
    { status: 409, body: JSON.stringify({ ok: false, code: 409, reason: "port 4101 in use" }) },
    { status: 403, body: JSON.stringify({ error: "forbidden origin" }) },
  ]);
  const api = makeHubApi({ fetchImpl });
  assert.deepEqual(await api.startRow("a"), { ok: false, reason: "port 4101 in use" });
  assert.deepEqual(await api.startRow("a"), {
    ok: false,
    reason: "the hub refused (403): forbidden origin",
  });
});

void test("startRow: a network error and a non-JSON answer come back as reasons", async () => {
  const { fetchImpl } = fakeFetch([
    new TypeError("Failed to fetch"),
    { status: 502, body: "<html>" },
  ]);
  const api = makeHubApi({ fetchImpl });
  assert.deepEqual(await api.startRow("a"), {
    ok: false,
    reason: "the hub could not be reached: Failed to fetch",
  });
  assert.deepEqual(await api.startRow("a"), {
    ok: false,
    reason: "the hub answered 502 with something that is not JSON",
  });
});

/** A fetch that never settles (`stall: "request"`) or whose body never settles (`"body"`), keeping
 * the signal it was given. @param {"request" | "body"} stall */
function stalledFetch(stall) {
  /** @type {AbortSignal[]} */
  const signals = [];
  /** @param {string} _url @param {{ method: string, signal: AbortSignal }} init */
  const fetchImpl = (_url, init) => {
    signals.push(init.signal);
    const never = /** @type {Promise<never>} */ (new Promise(() => {}));
    if (stall === "request") return never;
    return Promise.resolve({ status: 200, text: () => never });
  };
  return { fetchImpl, signals };
}

/** @template T @param {Promise<T>} p @param {string} label @returns {Promise<T>} */
const settled = (p, label) =>
  withDeadline(label, (/** @type {(v: T) => void} */ res, rej) => {
    p.then(res, rej);
  });

for (const stall of /** @type {const} */ (["request", "body"])) {
  void test(`startRow: a ${stall} that never settles is aborted at the deadline and gives a reason`, async () => {
    const t = fakeTimers();
    const { fetchImpl, signals } = stalledFetch(stall);
    const result = makeHubApi({ fetchImpl, timers: t.timers }).startRow("a");
    await flush();
    assert.equal(signals[0]?.aborted, false, "not aborted before the deadline");
    assert.equal(t.runOne(), POST_TIMEOUT_MS);
    assert.deepEqual(await settled(result, "the start result"), {
      ok: false,
      reason: "the hub did not answer the start within 45 s",
    });
    assert.deepEqual([signals[0]?.aborted, t.pending.size], [true, 0]);
  });
}
