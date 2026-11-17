import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEvents } from "./watcher.js";
import { withDeadline } from "../../core/http/test-deadline.js";
import { IDLE, fakeProject, rowSource, on, watch, stateOf } from "./watcher-test-support.js";

/** @typedef {import("./watcher.js").WatchRow} WatchRow */

test("parseEvents: complete events only, CRLF, multi-line data, comments ignored", () => {
  assert.deepEqual(parseEvents('data: {"a":1}\n\ndata: {"b"'), {
    datas: ['{"a":1}'],
    rest: 'data: {"b"',
  });
  assert.deepEqual(parseEvents(": ping\r\n\r\ndata: x\r\ndata: y\r\n\r\n").datas, ["x\ny"]);
});

test("first event is stored and listeners are told; the GET has no Origin", async (t) => {
  const p = await fakeProject(t);
  const { w, nextChange } = watch(t, { rows: rowSource([on("a", p.port)]).rows });
  const change = nextChange();
  await w.start();
  const [id, entry] = await change;
  assert.equal(id, "a");
  assert.equal(stateOf(entry), "idle");
  assert.equal(stateOf(w.get(on("a", p.port))), "idle");
  assert.equal(w.entries().size, 1);
  const [req] = p.requests;
  assert.ok(req);
  assert.equal(req.method, "GET");
  assert.equal(req.headers.origin, undefined);
  assert.equal(req.headers.host, `127.0.0.1:${p.port}`);
});

test("a change in the stream is told; a malformed or repeated event is not", async (t) => {
  const p = await fakeProject(t);
  const { w, changes, nextChange } = watch(t, { rows: rowSource([on("a", p.port)]).rows });
  const first = nextChange();
  await w.start();
  await first;
  const second = nextChange();
  p.write("data: not json\n\n");
  p.send(IDLE);
  p.write('data: {"path":"/p/alpha",');
  p.write('"state":"busy"}\n\n');
  const [, entry] = await second;
  assert.equal(stateOf(entry), "busy");
  assert.deepEqual(
    changes.map(([, e]) => stateOf(e)),
    ["idle", "busy"],
  );
});

test("a dropped connection is opened again", async (t) => {
  const p = await fakeProject(t);
  const { w, nextChange } = watch(t, { rows: rowSource([on("a", p.port)]).rows });
  const first = nextChange();
  await w.start();
  await first;
  const again = p.nextRequest();
  p.dropAll();
  await again;
  assert.equal(p.requests.length, 2);
});

test("a row that appears gets a connection", async (t) => {
  const p = await fakeProject(t);
  const src = rowSource([]);
  const { w, nextChange } = watch(t, { rows: src.rows });
  await w.start();
  const change = nextChange();
  src.set([on("a", p.port)]);
  await change;
  assert.equal(p.requests.length, 1);
});

test("a row that leaves loses its connection and its status, and listeners hear null", async (t) => {
  const p = await fakeProject(t);
  const src = rowSource([on("a", p.port)]);
  const { w, nextChange } = watch(t, { rows: src.rows });
  const first = nextChange();
  await w.start();
  await first;
  const closed = p.nextClose();
  const gone = nextChange();
  src.set([{ ...on("a", p.port), state: "off" }]);
  assert.deepEqual(await gone, ["a", null]);
  await closed;
  assert.equal(w.get(on("a", p.port)), null);
});

test("only rows that are on with a port are watched", async (t) => {
  const p = await fakeProject(t);
  const src = rowSource([
    { ...on("a", p.port), state: "held" },
    { ...on("b", p.port), state: "unknown" },
    { ...on("c", p.port), port: null },
  ]);
  const { w } = watch(t, { rows: src.rows });
  await w.start();
  await src.ticks(3);
  assert.equal(p.requests.length, 0);
});

test("404 is kept as no-stream and not asked again every tick", async (t) => {
  const p = await fakeProject(t, { mode: "404" });
  const src = rowSource([on("a", p.port)]);
  const { w, changes, nextChange } = watch(t, { rows: src.rows, noStreamRetryTicks: 1000 });
  const change = nextChange();
  await w.start();
  assert.equal(stateOf((await change)[1]), "no-stream");
  await src.ticks(10);
  assert.equal(p.requests.length, 1);
  assert.equal(changes.length, 1);
});

test("a no-stream row is asked again after noStreamRetryTicks refreshes", async (t) => {
  const p = await fakeProject(t, { mode: "404" });
  const src = rowSource([on("a", p.port)]);
  const { w } = watch(t, { rows: src.rows, noStreamRetryTicks: 3 });
  /** @type {number[]} */
  const at = [];
  const firstTwo = withDeadline("two requests", (r) => {
    const em = { count: 0 };
    const record = async () => {
      await p.nextRequest();
      at.push(src.calls());
      em.count += 1;
      if (em.count === 2) r(undefined);
      else void record();
    };
    void record();
  });
  await w.start();
  await firstTwo;
  assert.deepEqual(
    at.map((n) => n - (at[0] ?? 0)),
    [0, 3],
  );
});

test("never two connections to one row", async (t) => {
  const p = await fakeProject(t);
  const src = rowSource([on("a", p.port)]);
  const { w } = watch(t, { rows: src.rows });
  await Promise.all([w.start(), w.refresh(), w.refresh()]);
  await src.ticks(5);
  assert.equal(p.requests.length, 1);
  assert.equal(p.openCount(), 1);
});

test("a port change moves the connection to the new port", async (t) => {
  const a = await fakeProject(t);
  const b = await fakeProject(t, { first: { ...IDLE, state: "busy" } });
  const src = rowSource([on("x", a.port)]);
  const { w, nextChange } = watch(t, { rows: src.rows });
  const first = nextChange();
  await w.start();
  await first;
  const closed = a.nextClose();
  const dropped = nextChange();
  src.set([on("x", b.port)]);
  assert.deepEqual(await dropped, ["x", null]);
  const [, entry] = await nextChange();
  await closed;
  assert.equal(stateOf(entry), "busy");
});

test("a failing row source keeps the open streams and the timer", async (t) => {
  const p = await fakeProject(t);
  const src = rowSource([on("a", p.port)]);
  let fail = false;
  const { w, nextChange } = watch(t, {
    rows: () => {
      const list = src.rows();
      if (fail) throw new Error("bad read");
      return list;
    },
  });
  const first = nextChange();
  await w.start();
  await first;
  fail = true;
  await src.ticks(3);
  assert.equal(p.openCount(), 1);
  assert.equal(stateOf(w.get(on("a", p.port))), "idle");
});

test("stop() aborts every connection, ends the timer and silences listeners", async (t) => {
  const p = await fakeProject(t);
  const src = rowSource([on("a", p.port)]);
  /** @type {(l: WatchRow[]) => void} */
  let release = () => {};
  let pending = false;
  let reads = 0;
  const { w, changes, nextChange } = watch(t, {
    rows: () => {
      reads += 1;
      if (!pending) return src.rows();
      return new Promise((r) => {
        release = r;
      });
    },
  });
  const first = nextChange();
  await w.start();
  await first;
  pending = true;
  const inFlight = w.refresh();
  const closed = p.nextClose();
  w.stop();
  await closed;
  release([on("b", p.port)]);
  await inFlight;
  const before = reads;
  await new Promise((r) => setTimeout(r, 30)); // absence of ticks cannot be awaited
  assert.equal(reads, before);
  assert.equal(p.requests.length, 1);
  assert.equal(changes.length, 1);
  assert.equal(w.entries().size, 0);
});

test("stop() inside a listener silences the listeners after it", async (t) => {
  const p = await fakeProject(t);
  const { w } = watch(t, { rows: rowSource([on("a", p.port)]).rows });
  let later = 0;
  const stopped = withDeadline("the stopping listener", (r) => {
    w.onChange(() => {
      w.stop();
      r(undefined);
    });
  });
  w.onChange(() => {
    later += 1;
  });
  await w.start();
  await stopped;
  w.onChange(() => {
    later += 1;
  });
  assert.equal(later, 0);
});

test("stop() clears the pending refresh timer", async (t) => {
  const timers = () => process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
  const { w } = watch(t, { rows: () => [], intervalMs: 60_000 });
  const before = timers();
  await w.start();
  assert.equal(timers(), before + 1);
  w.stop();
  assert.equal(timers(), before);
});
