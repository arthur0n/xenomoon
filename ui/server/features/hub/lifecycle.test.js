import assert from "node:assert/strict";
import { test } from "node:test";
import { makeLifecycle } from "./lifecycle.js";
import { makeRowLoader } from "./rows.js";

/** @typedef {import("./rows.js").HubRow} HubRow */
/** @typedef {import("./status.js").HubRowStatus} HubRowStatus */
/** @typedef {import("./lifecycle.js").RunResult} RunResult */

/** @param {Partial<HubRow>} over @returns {HubRow} */
const row = (over = {}) => ({
  id: "r1",
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
  const other = row({ id: "r2", name: "b", project: "/tmp/project-b" });
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

test("start on a row with no port is refused with 409 naming the missing port, and runs nothing", async () => {
  const { run, calls } = fakeRun();
  const r = row({ name: "alpha", port: null });
  const res = await makeLifecycle({ run, snapshot: fakeSnapshot({}) }).start(r, [r]);
  assert.equal(res.ok, false);
  assert.equal(res.code, 409);
  assert.match(
    res.reason ?? "",
    /^no port: set projects\["alpha"\]\.port in \/tmp\/install-a\/\.xenomoon\.json$/,
  );
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

/** The #65 case over the real row loader: A on 4001 and B on 4002, then A loses its port and B
 * gets a string port, so the install file fails and the loader serves the cached rows. */
function staleCase() {
  const { load, files, file } = loaderCase();
  load();
  files.set(
    file,
    JSON.stringify({ projects: { a: { dir: "/tmp/project-a" }, b: { dir: "/tmp/b", port: "x" } } }),
  );
  const { rows } = load();
  const a = rows.find((r) => r.name === "a");
  assert.ok(a);
  return { a, rows, file };
}

/** The real row loader over an in-memory registry and install file (A on 4001, B on 4002). */
function loaderCase() {
  const file = "/tmp/install-a/.xenomoon.json";
  const files = new Map([
    ["/tmp/reg.json", JSON.stringify({ version: 1, installs: { "/tmp/install-a": null } })],
    [
      file,
      JSON.stringify({
        projects: { a: { dir: "/tmp/project-a", port: 4001 }, b: { dir: "/tmp/b", port: 4002 } },
      }),
    ],
  ]);
  const load = makeRowLoader({
    registryFile: "/tmp/reg.json",
    readFile: (f) => {
      const text = files.get(f);
      if (text === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return text;
    },
    writeFile: () => {},
    mkdir: () => undefined,
    sidecarDir: "/tmp/hub-errors",
    isInstall: () => true,
  });
  return { load, files, file };
}

/** A stop of A held open on its stop_server run, with a start of A queued behind it. `between`
 * edits the install file while the stop runs; the stop then finishes and the start goes on.
 * @param {(files: Map<string, string>, file: string) => void} between */
async function queuedStartBehindStop(between) {
  const { load, files, file } = loaderCase();
  const { rows } = load();
  const a = rows.find((r) => r.name === "a");
  assert.ok(a);
  /** @type {Record<string, Partial<HubRowStatus>>} */
  const states = { [a.id]: { state: "on" } };
  /** @type {string[]} */
  const calls = [];
  /** @type {(() => void) | undefined} */
  let releaseStop;
  const run = (/** @type {string} */ f) => {
    calls.push(f);
    if (!f.endsWith("/stop_server")) return Promise.resolve({ status: 0, stdout: "", stderr: "" });
    return new Promise((resolve) => {
      releaseStop = () => {
        states[a.id] = { state: "off" };
        resolve({ status: 0, stdout: "", stderr: "" });
      };
    });
  };
  const life = makeLifecycle({ run, snapshot: fakeSnapshot(states), load });
  const stopped = life.stop(a, rows);
  const started = life.start(a, rows);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(releaseStop, "the stop is running");
  between(files, file);
  releaseStop();
  assert.deepEqual(await stopped, { ok: true, code: 200, state: "off" });
  return { res: await started, calls, file };
}

test("a start queued behind a stop is refused with 409 when the config turned stale meanwhile, and runs nothing", async () => {
  const { res, calls, file } = await queuedStartBehindStop((files, f) => {
    files.set(f, JSON.stringify({ projects: { a: { dir: "/tmp/project-a" }, b: { port: "x" } } }));
  });
  assert.equal(res.ok, false);
  assert.equal(res.code, 409);
  assert.ok((res.reason ?? "").startsWith(`stale config: ${file} failed to read (`));
  assert.deepEqual(calls, ["/tmp/install-a/stop_server"]);
});

test("a start queued behind a stop is refused with 404 unknown row when the project left the map meanwhile, and runs nothing", async () => {
  const { res, calls } = await queuedStartBehindStop((files, f) => {
    files.set(f, JSON.stringify({ projects: { b: { dir: "/tmp/b", port: 4002 } } }));
  });
  assert.deepEqual(res, { ok: false, code: 404, reason: "unknown row" });
  assert.deepEqual(calls, ["/tmp/install-a/stop_server"]);
});

test("a start queued behind a stop starts when the config is still valid", async () => {
  const { res, calls } = await queuedStartBehindStop(() => {});
  assert.deepEqual(res, { ok: true, code: 200, state: "on" });
  assert.deepEqual(calls, ["/tmp/install-a/stop_server", "/tmp/install-a/start_server"]);
});

test("start on a row served from the last good copy is refused with 409 naming the failed file, and runs nothing", async () => {
  const { run, calls } = fakeRun();
  const { a, rows, file } = staleCase();
  const res = await makeLifecycle({ run, snapshot: fakeSnapshot({}) }).start(a, rows);
  assert.equal(res.ok, false);
  assert.equal(res.code, 409);
  assert.ok((res.reason ?? "").startsWith(`stale config: ${file} failed to read (`));
  assert.match(res.reason ?? "", /fix that file, then start again$/);
  assert.equal(calls.length, 0);
});

test("stop on a stale row still runs stop_server on the cached port", async () => {
  const { run, calls } = fakeRun({ status: 0 });
  const { a, rows } = staleCase();
  const snapshot = fakeSnapshot({ [a.id]: { state: "on" } });
  const res = await makeLifecycle({ run, snapshot }).stop(a, rows);
  assert.deepEqual(res, { ok: true, code: 200, state: "off" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.file, "/tmp/install-a/stop_server");
  assert.equal(calls[0]?.env.PORT, "4001");
});
