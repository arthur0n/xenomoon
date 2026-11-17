import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { EventEmitter } from "node:events";
import { makeStatusStream } from "./status-stream.js";
import { withDeadline } from "./test-deadline.js";

/** A status source the test edits, and a change subscription the test fires by hand. */
function fakes() {
  let current = {
    name: "alpha",
    path: "/p",
    domain: "webapp",
    port: 1,
    pid: 2,
    state: "idle",
    sessions: 1,
    lastLine: "hello",
    at: "2026-01-01T00:00:00.000Z",
  };
  /** @type {Set<() => void>} */
  const listeners = new Set();
  let unsubscribed = 0;
  /** @type {(() => void)[]} */
  const unsubWaiters = [];
  return {
    payload: () => ({ ...current }),
    /** @param {Partial<typeof current>} patch */
    set(patch) {
      current = { ...current, ...patch };
    },
    /** @param {() => void} l */
    subscribe(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
        unsubscribed += 1;
        unsubWaiters.splice(0).forEach((w) => {
          w();
        });
      };
    },
    notify: () => {
      [...listeners].forEach((l) => {
        l();
      });
    },
    listenerCount: () => listeners.size,
    unsubscribedCount: () => unsubscribed,
    /** @returns {Promise<void>} */
    nextUnsubscribe: () =>
      withDeadline("an unsubscribe", (r) => {
        unsubWaiters.push(r);
      }),
  };
}

/** Starts a server whose stop is registered on `t`, so it runs even when an assertion throws.
 * @param {import("node:test").TestContext} t @param {ReturnType<typeof fakes>} f */
async function startServer(t, f) {
  const stream = makeStatusStream({ payload: f.payload, subscribe: f.subscribe });
  const server = http.createServer((req, res) => {
    stream.handle(req, res);
  });
  t.after(() => stop({ stream, server }));
  await withDeadline("the server to listen", (r) => {
    server.listen(0, "127.0.0.1", () => {
      r();
    });
  });
  const port = /** @type {import("node:net").AddressInfo} */ (server.address()).port;
  return { stream, server, port };
}

/** Opens one stream; `events` fills as `data:` frames arrive, `waitFor(n)` resolves at n events.
 * @param {number} port @param {Record<string, string>} [headers] */
async function connect(port, headers = {}) {
  /** @type {Record<string, unknown>[]} */
  const events = [];
  /** @type {{ n: number, resolve: () => void, reject: (err: Error) => void }[]} */
  const waiters = [];
  let ended = false;
  /** @type {(() => void)[]} */
  const endWaiters = [];
  /** @type {http.ClientRequest | undefined} */
  let req;
  const res = await withDeadline(
    "the stream response headers",
    /** @type {(resolve: (r: http.IncomingMessage) => void, reject: (err: Error) => void) => void} */
    (resolve, reject) => {
      req = http.get({ host: "127.0.0.1", port, path: "/", headers }, resolve);
      req.on("error", reject);
    },
    () => req?.destroy(),
  );
  let buf = "";
  res.setEncoding("utf8");
  res.on("data", (/** @type {string} */ chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      assert.ok(frame.startsWith("data: "), `frame is a data line: ${frame}`);
      const parsed = /** @type {unknown} */ (JSON.parse(frame.slice("data: ".length)));
      events.push(/** @type {Record<string, unknown>} */ (parsed));
    }
    for (const w of [...waiters]) {
      if (events.length >= w.n) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve();
      }
    }
  });
  res.on("end", () => {
    ended = true;
    endWaiters.splice(0).forEach((w) => {
      w();
    });
    waiters.splice(0).forEach((w) => {
      w.reject(new Error(`connection ended after ${events.length} events, waiting for ${w.n}`));
    });
  });
  return {
    res,
    events,
    /** @param {number} n @returns {Promise<void>} */
    waitFor: (n) =>
      withDeadline(`event ${n}`, (resolve, reject) => {
        if (events.length >= n) resolve();
        else if (ended)
          reject(new Error(`connection ended after ${events.length} events, waiting for ${n}`));
        else waiters.push({ n, resolve, reject });
      }),
    /** @returns {Promise<void>} */
    ended: () =>
      withDeadline("the connection end", (resolve) => {
        if (ended) resolve();
        else endWaiters.push(resolve);
      }),
  };
}

/** Safe to call twice: a test that closed the server itself still gets the `t.after` stop.
 * @param {{ stream: { closeAll: () => void }, server: http.Server }} s */
async function stop(s) {
  s.stream.closeAll();
  s.server.closeAllConnections();
  if (!s.server.listening) return;
  await closeServer(s.server);
}

/** @param {http.Server} server @returns {Promise<void>} */
function closeServer(server) {
  return withDeadline("server.close", (r) => {
    server.close(() => {
      r();
    });
  });
}

test("stream: answers 200 with SSE headers and sends the current status at once", async (t) => {
  const f = fakes();
  const s = await startServer(t, f);
  const c = await connect(s.port);
  assert.equal(c.res.statusCode, 200);
  assert.equal(c.res.headers["content-type"], "text/event-stream");
  assert.equal(c.res.headers["cache-control"], "no-store");
  assert.equal(c.res.headers.connection, "keep-alive");
  await c.waitFor(1);
  assert.deepEqual(c.events[0], f.payload());
});

test("stream: a state change after a notification sends one new event", async (t) => {
  const f = fakes();
  const s = await startServer(t, f);
  const c = await connect(s.port);
  await c.waitFor(1);
  f.set({ state: "working" });
  f.notify();
  await c.waitFor(2);
  assert.equal(c.events[1]?.state, "working");
});

test("stream: a notification where only `at` moved sends nothing", async (t) => {
  const f = fakes();
  const s = await startServer(t, f);
  const c = await connect(s.port);
  await c.waitFor(1);
  f.set({ at: "2026-01-01T00:00:09.000Z" });
  f.notify();
  // Positive marker: the next real change must be the very next event.
  f.set({ sessions: 2 });
  f.notify();
  await c.waitFor(2);
  assert.equal(c.events.length, 2);
  assert.equal(c.events[1]?.sessions, 2);
});

test("stream: a lastLine change is a change for a connection without Origin", async (t) => {
  const f = fakes();
  const s = await startServer(t, f);
  const c = await connect(s.port);
  await c.waitFor(1);
  f.set({ lastLine: "next line" });
  f.notify();
  await c.waitFor(2);
  assert.equal(c.events[1]?.lastLine, "next line");
});

test("stream: a request with any Origin never receives lastLine and gets no CORS header", async (t) => {
  const f = fakes();
  const s = await startServer(t, f);
  const c = await connect(s.port, { origin: "http://evil.example" });
  await c.waitFor(1);
  const { lastLine: _drop, ...expected } = f.payload();
  assert.deepEqual(c.events[0], expected);
  assert.equal(c.res.headers["access-control-allow-origin"], undefined);
});

test("stream: an empty Origin header never receives lastLine; a no-Origin one beside it does", async (t) => {
  const f = fakes();
  const s = await startServer(t, f);
  const empty = await connect(s.port, { origin: "" });
  const none = await connect(s.port);
  await empty.waitFor(1);
  await none.waitFor(1);
  const { lastLine: _drop, ...expected } = f.payload();
  assert.deepEqual(empty.events[0], expected);
  assert.deepEqual(none.events[0], f.payload());
});

test("stream: for an Origin connection a lastLine-only change sends nothing", async (t) => {
  const f = fakes();
  const s = await startServer(t, f);
  const c = await connect(s.port, { origin: "http://127.0.0.1:3000" });
  await c.waitFor(1);
  f.set({ lastLine: "secret" });
  f.notify();
  f.set({ state: "waiting" });
  f.notify();
  await c.waitFor(2);
  assert.equal(c.events.length, 2);
  assert.equal(c.events[1]?.state, "waiting");
  assert.equal("lastLine" in (c.events[1] ?? {}), false);
});

test("stream: a client close unsubscribes it once and drops it from the open set", async (t) => {
  const f = fakes();
  const s = await startServer(t, f);
  const c = await connect(s.port);
  await c.waitFor(1);
  assert.equal(f.listenerCount(), 1);
  const gone = f.nextUnsubscribe();
  c.res.destroy();
  await gone;
  assert.equal(f.listenerCount(), 0);
  // Dropped from the open set: closeAll must not unsubscribe it a second time.
  s.stream.closeAll();
  assert.equal(f.unsubscribedCount(), 1);
});

test("stream: closeAll ends every open response and unsubscribes them", async (t) => {
  const f = fakes();
  const s = await startServer(t, f);
  const a = await connect(s.port);
  const b = await connect(s.port, { origin: "http://x" });
  await Promise.all([a.waitFor(1), b.waitFor(1)]);
  assert.equal(f.listenerCount(), 2);
  s.stream.closeAll();
  await Promise.all([a.ended(), b.ended()]);
  assert.equal(f.listenerCount(), 0);
  assert.equal(f.unsubscribedCount(), 2);
  // server.close finishes only because no response is left open.
  await closeServer(s.server);
});

/** A fake response whose `write` returns what the test says and that emits `drain` on demand. */
function fakeRes() {
  const res = Object.assign(new EventEmitter(), {
    /** @type {string[]} */
    writes: [],
    accept: false,
    writeHead: () => res,
    /** @param {string} chunk */
    write: (chunk) => {
      res.writes.push(chunk);
      return res.accept;
    },
    end: () => {
      res.emit("close");
    },
  });
  return res;
}

/** @param {ReturnType<typeof fakes>} f */
function openBlocked(f) {
  const stream = makeStatusStream({ payload: f.payload, subscribe: f.subscribe });
  const res = fakeRes();
  stream.handle(
    /** @type {import("node:http").IncomingMessage} */ (/** @type {unknown} */ ({ headers: {} })),
    /** @type {import("node:http").ServerResponse} */ (/** @type {unknown} */ (res)),
  );
  return { stream, res };
}

test("stream: after a write reports backpressure no further write happens until drain", () => {
  const f = fakes();
  const { res } = openBlocked(f);
  assert.equal(res.writes.length, 1);
  for (const state of ["working", "waiting", "idle-again"]) {
    f.set({ state });
    f.notify();
  }
  assert.equal(res.writes.length, 1);
});

test("stream: on drain one event carries the latest status, not each intermediate one", () => {
  const f = fakes();
  const { res } = openBlocked(f);
  f.set({ state: "working" });
  f.notify();
  f.set({ state: "waiting", sessions: 3 });
  f.notify();
  res.accept = true;
  res.emit("drain");
  assert.equal(res.writes.length, 2);
  const parsed = /** @type {unknown} */ (JSON.parse(res.writes[1]?.slice("data: ".length) ?? ""));
  const last = /** @type {Record<string, unknown>} */ (parsed);
  assert.equal(last.state, "waiting");
  assert.equal(last.sessions, 3);
  // Nothing newer since: a second drain sends nothing.
  res.emit("drain");
  assert.equal(res.writes.length, 2);
});

test("stream: client close and closeAll remove the drain listener", () => {
  const f = fakes();
  const a = openBlocked(f);
  assert.equal(a.res.listenerCount("drain"), 1);
  a.res.emit("close");
  assert.equal(a.res.listenerCount("drain"), 0);
  const b = openBlocked(f);
  assert.equal(b.res.listenerCount("drain"), 1);
  b.stream.closeAll();
  assert.equal(b.res.listenerCount("drain"), 0);
});
