// The per-server status snapshot (#60): pure tests over hand-built LiveSession-like fakes.
// Static imports HOIST above any statement, so the env must be set via a dynamic import chain —
// config.js resolves a domain at import time and an unbound trunk would throw before the tests run.
process.env.XENOMOON_DOMAIN ??= "webapp";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const { statusPayload, statusEnv } = await import("./status.js");
const { projectName } = await import("./project-state.js");

/** @typedef {import("./status.js").StatusSession} StatusSession */

const ENV = { name: "demo", path: "/p/demo", domain: "webapp", port: 3117, pid: 42 };
const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);

/** @param {Partial<{ pending: [number, unknown][], busy: boolean, lastLine: string, runningAgents: number, activitySeq: number }>} [o]
 * @returns {StatusSession} */
function fake(o = {}) {
  return /** @type {StatusSession} */ (
    /** @type {unknown} */ ({
      pending: new Map(o.pending ?? []),
      busy: { value: o.busy ?? false },
      lastLine: o.lastLine ?? "",
      runningAgents: o.runningAgents ?? 0,
      activitySeq: o.activitySeq ?? 0,
    })
  );
}

/** @param {string} type @param {Record<string, unknown>} payload */
const entry = (type, payload) => ({ type, resolve: () => {}, msg: { type, id: 1, ...payload } });

test("payload has exactly the documented keys", () => {
  const keys = Object.keys(statusPayload([], NOW, ENV)).sort();
  assert.deepEqual(keys, [
    "at",
    "domain",
    "lastLine",
    "name",
    "path",
    "pid",
    "port",
    "sessions",
    "state",
  ]);
});

test("no sessions → idle, count 0, empty lastLine, env copied", () => {
  const p = statusPayload([], NOW, ENV);
  assert.equal(p.state, "idle");
  assert.equal(p.sessions, 0);
  assert.equal(p.lastLine, "");
  assert.deepEqual(
    [p.name, p.path, p.domain, p.port, p.pid],
    ["demo", "/p/demo", "webapp", 3117, 42],
  );
});

test("idle sessions → idle with the session count", () => {
  const p = statusPayload([fake(), fake()], NOW, ENV);
  assert.equal(p.state, "idle");
  assert.equal(p.sessions, 2);
});

test("a busy turn → working", () => {
  assert.equal(statusPayload([fake(), fake({ busy: true })], NOW, ENV).state, "working");
});

test("a running sub-agent alone → working", () => {
  assert.equal(statusPayload([fake({ runningAgents: 1 })], NOW, ENV).state, "working");
});

test("waiting in one session beats working in another", () => {
  const ask = entry("ask", { input: { questions: [{ question: "Which db?" }] }, agent: "main" });
  const p = statusPayload([fake({ busy: true }), fake({ pending: [[1, ask]] })], NOW, ENV);
  assert.equal(p.state, "waiting");
});

test("a pending form counts as waiting and its title is the lastLine", () => {
  const form = entry("form", { input: { title: "Pick a plan", fields: [] }, agent: "main" });
  const p = statusPayload([fake({ pending: [[1, form]], lastLine: "old" })], NOW, ENV);
  assert.equal(p.state, "waiting");
  assert.equal(p.lastLine, "Pick a plan");
});

test("lastLine comes from the highest activitySeq regardless of array order", () => {
  const a = fake({ lastLine: "older", activitySeq: 3 });
  const b = fake({ lastLine: "newest", activitySeq: 9 });
  const c = fake({ lastLine: "middle", activitySeq: 5 });
  assert.equal(statusPayload([b, a, c], NOW, ENV).lastLine, "newest");
  assert.equal(statusPayload([a, c, b], NOW, ENV).lastLine, "newest");
});

test("when waiting, lastLine is the pending text of the most recently active waiting session", () => {
  const ask = entry("ask", { input: { questions: [{ question: "Which db?" }] }, agent: "main" });
  const perm = entry("permission", { toolName: "Bash", input: {}, agent: "main" });
  const p = statusPayload(
    [
      fake({ pending: [[1, perm]], lastLine: "x", activitySeq: 2 }),
      fake({ pending: [[1, ask]], lastLine: "y", activitySeq: 7 }),
      fake({ busy: true, lastLine: "busy line", activitySeq: 99 }),
    ],
    NOW,
    ENV,
  );
  assert.equal(p.lastLine, "Which db?");
  const solo = statusPayload([fake({ pending: [[1, perm]], lastLine: "x" })], NOW, ENV);
  assert.equal(solo.lastLine, "Bash");
});

test("at is the ISO string of now", () => {
  assert.equal(statusPayload([], NOW, ENV).at, "2026-11-09T12:00:00.000Z");
});

test("statusEnv() is resolved once (same object on every call)", () => {
  const a = statusEnv();
  assert.equal(statusEnv(), a);
  assert.equal(a.pid, process.pid);
});

test("projectName reads package.json name, else falls back to the dir basename", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "xm-status-"));
  try {
    assert.equal(projectName(dir), path.basename(dir));
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "my-app" }));
    assert.equal(projectName(dir), "my-app");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
