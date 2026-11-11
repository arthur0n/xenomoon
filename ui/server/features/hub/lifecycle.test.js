import assert from "node:assert/strict";
import { test } from "node:test";
import { makeLifecycle } from "./lifecycle.js";

/** @typedef {import("./rows.js").HubRow} HubRow */
/** @typedef {import("./status.js").HubRowStatus} HubRowStatus */
/** @typedef {import("./lifecycle.js").RunResult} RunResult */

/** @param {Partial<HubRow>} over @returns {HubRow} */
const row = (over = {}) => ({
  id: "r1",
  kind: "install",
  install: "/tmp/install-a",
  name: "install-a",
  project: "/tmp/project-a",
  port: 4100,
  domain: null,
  ...over,
});

/** A snapshot that gives each row the state in `states` (by id), "off" otherwise.
 * @param {Record<string, Partial<HubRowStatus>>} states */
const fakeSnapshot = (states) => async (/** @type {HubRow[]} */ rows) => ({
  rows: rows.map((r) => /** @type {HubRowStatus} */ ({ ...r, state: "off", ...states[r.id] })),
});

/** A run that records its calls and answers with `result`.
 * @param {Partial<RunResult>} [result] */
function fakeRun(result = {}) {
  /** @type {{ file: string, args: string[], cwd: string, env: NodeJS.ProcessEnv }[]} */
  const calls = [];
  const run = async (
    /** @type {string} */ file,
    /** @type {string[]} */ args,
    /** @type {{ cwd: string, env: NodeJS.ProcessEnv }} */ { cwd, env },
  ) => {
    calls.push({ file, args, cwd, env });
    return { status: 0, stdout: "", stderr: "", ...result };
  };
  return { run, calls };
}

test("start on a row that is already on is a 200 noop and runs nothing", async () => {
  const { run, calls } = fakeRun();
  const life = makeLifecycle({ run, snapshot: fakeSnapshot({ r1: { state: "on" } }) });
  const res = await life.start(row(), [row()]);
  assert.deepEqual(res, { ok: true, code: 200, state: "on", noop: true });
  assert.equal(calls.length, 0);
});

test("start on a held row is refused with 409 naming the holder path", async () => {
  const { run, calls } = fakeRun();
  const held = { state: /** @type {const} */ ("held"), status: { path: "/tmp/project-b" } };
  const life = makeLifecycle({ run, snapshot: fakeSnapshot({ r1: /** @type {any} */ (held) }) });
  const res = await life.start(row(), [row()]);
  assert.equal(res.code, 409);
  assert.equal(res.ok, false);
  assert.match(res.reason ?? "", /\/tmp\/project-b/);
  assert.equal(calls.length, 0);
});

test("start is refused with 409 naming the other row when it is on on the same port", async () => {
  const { run, calls } = fakeRun();
  const other = row({ id: "r2", kind: "profile", name: "b", project: "/tmp/project-b" });
  const life = makeLifecycle({ run, snapshot: fakeSnapshot({ r2: { state: "on" } }) });
  const res = await life.start(row(), [row(), other]);
  assert.equal(res.code, 409);
  assert.match(res.reason ?? "", /r2/);
  assert.equal(calls.length, 0);
});

test("start on a row whose port state is unknown is refused with 409", async () => {
  const { run, calls } = fakeRun();
  const snapshot = fakeSnapshot({ r1: { state: "unknown", reason: "timeout" } });
  const res = await makeLifecycle({ run, snapshot }).start(row(), [row()]);
  assert.equal(res.code, 409);
  assert.match(res.reason ?? "", /port state unknown: timeout/);
  assert.equal(calls.length, 0);
});

test("start on an off row runs start_server with the project, cwd, port and domain", async () => {
  const { run, calls } = fakeRun({ status: 0 });
  const r = row({ domain: "webapp" });
  const res = await makeLifecycle({ run, snapshot: fakeSnapshot({}) }).start(r, [r]);
  assert.deepEqual(res, { ok: true, code: 200, state: "on" });
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.ok(call);
  assert.equal(call.file, "/tmp/install-a/start_server");
  assert.deepEqual(call.args, ["/tmp/project-a"]);
  assert.equal(call.cwd, "/tmp/install-a");
  assert.equal(call.env.PORT, "4100");
  assert.equal(call.env.XENOMOON_DOMAIN, "webapp");
});

test("start_server exit 1 gives 502 with the output tail", async () => {
  const { run } = fakeRun({ status: 1, stderr: "Port 4100 is held by PID 9\n", stdout: "x\n" });
  const res = await makeLifecycle({ run, snapshot: fakeSnapshot({}) }).start(row(), [row()]);
  assert.equal(res.code, 502);
  assert.match(res.reason ?? "", /start_server exit 1/);
  assert.match(res.tail ?? "", /held by PID 9/);
});

test("start_server exit 3 gives 503 lsof missing", async () => {
  const { run } = fakeRun({ status: 3, stderr: "lsof not available\n" });
  const res = await makeLifecycle({ run, snapshot: fakeSnapshot({}) }).start(row(), [row()]);
  assert.equal(res.code, 503);
  assert.match(res.reason ?? "", /lsof missing/);
  assert.match(res.tail ?? "", /lsof not available/);
});

test("start on an unbound row is refused with 409 and runs nothing", async () => {
  const { run, calls } = fakeRun();
  const r = row({ project: null });
  const res = await makeLifecycle({ run, snapshot: fakeSnapshot({}) }).start(r, [r]);
  assert.equal(res.code, 409);
  assert.match(res.reason ?? "", /no bound project/);
  assert.equal(calls.length, 0);
});

test("stop on an off row is a 200 noop and runs nothing", async () => {
  const { run, calls } = fakeRun();
  const res = await makeLifecycle({ run, snapshot: fakeSnapshot({}) }).stop(row(), [row()]);
  assert.deepEqual(res, { ok: true, code: 200, state: "off", noop: true });
  assert.equal(calls.length, 0);
});

test("stop on a held row is refused with 409 naming the holder path", async () => {
  const { run, calls } = fakeRun();
  const held = { state: "held", status: { path: "/tmp/project-b" } };
  const snapshot = fakeSnapshot({ r1: /** @type {any} */ (held) });
  const res = await makeLifecycle({ run, snapshot }).stop(row(), [row()]);
  assert.equal(res.code, 409);
  assert.match(res.reason ?? "", /\/tmp\/project-b/);
  assert.equal(calls.length, 0);
});

test("stop on an on row runs stop_server with the port and exit 0 gives 200 off", async () => {
  const { run, calls } = fakeRun({ status: 0 });
  const snapshot = fakeSnapshot({ r1: { state: "on" } });
  const res = await makeLifecycle({ run, snapshot }).stop(row(), [row()]);
  assert.deepEqual(res, { ok: true, code: 200, state: "off" });
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.ok(call);
  assert.equal(call.file, "/tmp/install-a/stop_server");
  assert.deepEqual(call.args, []);
  assert.equal(call.cwd, "/tmp/install-a");
  assert.equal(call.env.PORT, "4100");
});

test("stop_server exit 3 gives 502 with state unknown and the tail", async () => {
  const { run } = fakeRun({ status: 3, stdout: "Could not inspect port\n" });
  const snapshot = fakeSnapshot({ r1: { state: "on" } });
  const res = await makeLifecycle({ run, snapshot }).stop(row(), [row()]);
  assert.equal(res.code, 502);
  assert.equal(res.state, "unknown");
  assert.match(res.reason ?? "", /could not tell/);
  assert.match(res.tail ?? "", /Could not inspect port/);
});

test("two starts on the same port run one after the other even from different installs, another port at once", async () => {
  /** @type {string[]} */
  const events = [];
  /** @type {(() => void) | undefined} */
  let releaseFirst;
  let n = 0;
  const run = (/** @type {string} */ _file, /** @type {string[]} */ args) => {
    n += 1;
    const label = `run${n}:${args[0]}`;
    events.push(label);
    if (n !== 1) return Promise.resolve({ status: 0, stdout: "", stderr: "" });
    return new Promise((resolve) => {
      releaseFirst = () => {
        events.push("release1");
        resolve({ status: 0, stdout: "", stderr: "" });
      };
    });
  };
  const life = makeLifecycle({ run, snapshot: fakeSnapshot({}) });
  const a = row();
  const b = row({ id: "r3", port: 4200, project: "/tmp/project-b" });
  const alias = row({ id: "r2", install: "/tmp/install-a-link", name: "install-a-link" });
  const first = life.start(a, [a]);
  const second = life.start(alias, [alias]);
  const other = life.start(b, [b]);
  await other;
  assert.deepEqual(events, ["run1:/tmp/project-a", "run2:/tmp/project-b"]);
  assert.ok(releaseFirst);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, [
    "run1:/tmp/project-a",
    "run2:/tmp/project-b",
    "release1",
    "run3:/tmp/project-a",
  ]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(life.busy(), 0);
});
