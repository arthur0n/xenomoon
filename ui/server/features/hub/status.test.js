import assert from "node:assert/strict";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { aggregate, probeRow } from "./status.js";

/** @typedef {import("./rows.js").HubRow} HubRow */
/** @typedef {import("./status.js").ProbeResult} ProbeResult */

/** @param {Partial<HubRow>} over @returns {HubRow} */
const row = (over) => ({
  id: "r1",
  kind: "install",
  install: "/tmp/install-a",
  name: "install-a",
  project: "/tmp/project-a",
  port: 4100,
  domain: null,
  ...over,
});

/** A fake fetch answering one Response, recording each URL and init it was called with.
 * @param {() => Response | Promise<Response>} answer */
function fakeFetch(answer) {
  /** @type {Array<{ url: string, init: RequestInit | undefined }>} */
  const calls = [];
  /** @type {typeof fetch} */
  const fetchImpl = async (url, init) => {
    calls.push({ url: url instanceof Request ? url.url : url.toString(), init });
    return answer();
  };
  return { fetchImpl, calls };
}

/** @param {unknown} body @param {number} [status] */
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const identity = (/** @type {string} */ p) => p;

const tmp = mkdtempSync(path.join(os.tmpdir(), "hub-status-"));
after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test("a server reporting the row's project path is on, and the request has no extra headers", async () => {
  const { fetchImpl, calls } = fakeFetch(() => json({ path: "/tmp/project-a", state: "idle" }));
  const result = await probeRow(row({}), { fetchImpl, realpath: identity });
  assert.equal(result.state, "on");
  assert.equal(result.status?.path, "/tmp/project-a");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "http://127.0.0.1:4100/api/status");
  assert.deepEqual(Object.keys(calls[0]?.init ?? {}), ["signal"]);
});

test("a trailing slash on one spelling of the same real directory is still on", async () => {
  const { fetchImpl } = fakeFetch(() => json({ path: `${tmp}/` }));
  const result = await probeRow(row({ project: tmp }), { fetchImpl });
  assert.equal(result.state, "on");
  // realpath drops the slash of an existing dir; a missing path relies on the strip alone.
  const missing = fakeFetch(() => json({ path: "/tmp/project-a-missing/" }));
  const fallback = await probeRow(row({ project: "/tmp/project-a-missing" }), {
    fetchImpl: missing.fetchImpl,
  });
  assert.equal(fallback.state, "on");
});

test("a server reporting another project's path holds the port", async () => {
  const { fetchImpl } = fakeFetch(() => json({ path: "/tmp/project-b" }));
  const result = await probeRow(row({}), { fetchImpl, realpath: identity });
  assert.equal(result.state, "held");
  assert.equal(result.status?.path, "/tmp/project-b");
});

test("a refused connection means the row is off", async () => {
  const refused = new TypeError("fetch failed", {
    cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" }),
  });
  const { fetchImpl } = fakeFetch(() => Promise.reject(refused));
  assert.deepEqual(await probeRow(row({}), { fetchImpl }), { state: "off" });
});

test("a timeout is unknown with reason timeout", async () => {
  const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
  const { fetchImpl } = fakeFetch(() => Promise.reject(timeout));
  assert.deepEqual(await probeRow(row({}), { fetchImpl }), { state: "unknown", reason: "timeout" });
});

test("an HTTP 500 is unknown with the status code as the reason", async () => {
  const { fetchImpl } = fakeFetch(() => json({ path: "/tmp/project-a" }, 500));
  assert.deepEqual(await probeRow(row({}), { fetchImpl }), { state: "unknown", reason: "500" });
});

test("JSON without a string path is unknown as not a status payload", async () => {
  const { fetchImpl } = fakeFetch(() => json({ name: "x", path: 7 }));
  assert.deepEqual(await probeRow(row({}), { fetchImpl }), {
    state: "unknown",
    reason: "not a status payload",
  });
});

test("a row with no bound project is unbound and makes no request", async () => {
  const { fetchImpl, calls } = fakeFetch(() => json({ path: "/tmp/project-a" }));
  assert.deepEqual(await probeRow(row({ project: null }), { fetchImpl }), { state: "unbound" });
  assert.equal(calls.length, 0);
});

test("a Node fetch GET to a local server carries no Origin header", async () => {
  /** @type {Array<string | undefined>} */
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.headers.origin);
    res.end("{}");
  });
  after(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  });
  await new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      resolve(undefined);
    }),
  );
  const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
  const res = await fetch(`http://127.0.0.1:${port}/api/status`);
  await res.text();
  assert.equal(seen.length, 1);
  assert.equal(seen[0], undefined);
});

test("aggregate marks rows sharing a port and probes all rows in parallel", async () => {
  /** @type {string[]} */
  const started = [];
  /** @type {(v?: unknown) => void} */
  let release = () => {};
  const gate = new Promise((resolve) => (release = resolve));
  /** @param {HubRow} r @returns {Promise<ProbeResult>} */
  const probe = async (r) => {
    started.push(r.id);
    await gate;
    return { state: r.id === "a" ? "on" : "off" };
  };
  const rows = [
    row({ id: "a", port: 4100 }),
    row({ id: "b", port: 4100 }),
    row({ id: "c", port: 4200 }),
  ];
  const pending = aggregate(rows, { probe, now: () => new Date("2026-11-10T12:00:00.000Z") });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["a", "b", "c"]);
  release();
  const result = await pending;
  assert.equal(result.at, "2026-11-10T12:00:00.000Z");
  assert.deepEqual(
    result.rows.map((r) => [r.id, r.state, r.conflict]),
    [
      ["a", "on", ["b"]],
      ["b", "off", ["a"]],
      ["c", "off", undefined],
    ],
  );
});

const privateTmp = existsSync("/private/tmp") && realpathSync("/tmp") === "/private/tmp";
test(
  "a /tmp path and its /private/tmp spelling are the same project",
  { skip: privateTmp ? false : "no /tmp to /private/tmp link here" },
  async () => {
    const dir = mkdtempSync("/tmp/hub-status-");
    after(() => {
      rmSync(dir, { recursive: true, force: true });
    });
    const { fetchImpl } = fakeFetch(() => json({ path: `/private${dir}` }));
    assert.equal((await probeRow(row({ project: dir }), { fetchImpl })).state, "on");
  },
);
