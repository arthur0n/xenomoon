import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_EVENT_BYTES } from "./watcher.js";
import { IDLE, fakeProject, rowSource, on, watch } from "./watcher-test-support.js";

test("a 500 whose body never ends is closed, so no socket outlives it", async (t) => {
  const p = await fakeProject(t, { mode: "hang500" });
  const { w } = watch(t, { rows: rowSource([on("a", p.port)]).rows, intervalMs: 60_000 });
  const closed = p.nextClose();
  await w.start();
  await closed;
  assert.equal(p.openCount(), 0);
});

test("an event from another project on the port is not stored; the stream closes and retries", async (t) => {
  const p = await fakeProject(t, { first: { ...IDLE, path: "/p/beta" } });
  const { w, changes } = watch(t, { rows: rowSource([on("a", p.port)]).rows });
  const first = p.nextRequest();
  await w.start();
  await first;
  const closed = p.nextClose();
  const retry = p.nextRequest();
  await closed;
  await retry;
  assert.equal(w.get(on("a", p.port)), null);
  assert.equal(changes.length, 0);
});

test("an event that never ends is aborted past MAX_EVENT_BYTES and asked again", async (t) => {
  const p = await fakeProject(t, { first: null });
  const { w } = watch(t, { rows: rowSource([on("a", p.port)]).rows });
  const first = p.nextRequest();
  await w.start();
  await first;
  const closed = p.nextClose();
  const retry = p.nextRequest();
  p.write(`data: ${"x".repeat(MAX_EVENT_BYTES)}`);
  await closed;
  await retry;
  assert.equal(w.get(on("a", p.port)), null);
});

test("a complete event over MAX_EVENT_BYTES is not stored and the stream is aborted", async (t) => {
  const p = await fakeProject(t, { first: null });
  const { w, changes } = watch(t, { rows: rowSource([on("a", p.port)]).rows });
  const first = p.nextRequest();
  await w.start();
  await first;
  const closed = p.nextClose();
  p.send({ ...IDLE, lastLine: "x".repeat(MAX_EVENT_BYTES) });
  await closed;
  assert.equal(changes.length, 0);
});

test("a dropped stream's status is dropped and listeners hear null until a new event", async (t) => {
  const p = await fakeProject(t);
  const { w, nextChange } = watch(t, { rows: rowSource([on("a", p.port)]).rows });
  const first = nextChange();
  await w.start();
  await first;
  const dropped = nextChange();
  p.dropAll();
  assert.deepEqual(await dropped, ["a", null]);
  assert.equal(w.get(on("a", p.port)), null);
});
