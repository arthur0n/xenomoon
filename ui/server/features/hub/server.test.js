// The hub's HTTP handler over a real port-0 server with fake load, aggregate and lifecycle.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { makeHubHandler, startHubServer } from "./server.js";

/** @type {import("./rows.js").HubRow} */
const ROW_A = {
  id: "a".repeat(16),
  kind: "install",
  install: "/tmp/install-a",
  name: "install-a",
  project: "/tmp/project-a",
  port: 3001,
  domain: null,
};
const ERRORS = [{ file: "/tmp/install-a/bad.json", reason: "bad json", at: "x", sidecar: null }];
const AT = "2026-11-10T00:00:00.000Z";

/** @type {{ op: string, row: unknown, rows: unknown }[]} */
const calls = [];
/** Calls to load and aggregate, by name. @type {string[]} */
const reads = [];
let nextCode = 200;
let loadThrows = false;
const deps = {
  load: () => {
    reads.push("load");
    if (loadThrows) throw new Error("registry unreadable");
    return { rows: [ROW_A], errors: ERRORS };
  },
  aggregate: async (/** @type {import("./rows.js").HubRow[]} */ rows) => {
    reads.push("aggregate");
    return { rows: rows.map((r) => ({ ...r, state: "off" })), at: AT };
  },
  lifecycle: {
    start: async (/** @type {unknown} */ row, /** @type {unknown} */ rows) => {
      calls.push({ op: "start", row, rows });
      return nextCode === 200
        ? { ok: true, code: 200, state: /** @type {const} */ ("on") }
        : { ok: false, code: nextCode, reason: "port 3001 in use by row b" };
    },
    stop: async (/** @type {unknown} */ row, /** @type {unknown} */ rows) => {
      calls.push({ op: "stop", row, rows });
      return { ok: true, code: 200, state: /** @type {const} */ ("off") };
    },
  },
  ownHost: "",
};
/** @type {import("node:http").Server} */
let server;
let base = "";

before(async () => {
  const started = await startHubServer({
    handler: makeHubHandler(deps),
    port: 0,
  });
  server = started.server;
  base = started.address;
  deps.ownHost = base.slice("http://".length);
});
after(async () => {
  await new Promise((resolve) => {
    server.close(() => {
      resolve(undefined);
    });
  });
});
beforeEach(() => {
  calls.length = 0;
  reads.length = 0;
  nextCode = 200;
  loadThrows = false;
});

const startUrl = () => `${base}/api/hub/rows/${ROW_A.id}/start`;

test("GET status returns the rows with their states and the load errors, ignoring the query", async () => {
  const r = await fetch(`${base}/api/hub/status?t=123`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { rows: [{ ...ROW_A, state: "off" }], errors: ERRORS, at: AT });
});

test("GET ping answers hub true and the pid without calling load or aggregate", async () => {
  const r = await fetch(`${base}/api/hub/ping?t=1`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { hub: true, pid: process.pid });
  assert.deepEqual(reads, []);
  assert.equal(calls.length, 0);
});

test("GET on an unknown path is a 404", async () => {
  const r = await fetch(`${base}/api/hub/nope`);
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { error: "not found" });
});

test("PUT is refused with 405 and an allow header of GET and POST", async () => {
  const r = await fetch(`${base}/api/hub/status`, { method: "PUT" });
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("allow"), "GET, POST");
  assert.equal(calls.length, 0);
});

test("POST start without an Origin calls the lifecycle with the resolved row and returns its result", async () => {
  const r = await fetch(startUrl(), { method: "POST" });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, code: 200, state: "on" });
  assert.deepEqual(calls, [{ op: "start", row: ROW_A, rows: [ROW_A] }]);
});

test("POST start carries a refusal code from the lifecycle as the response status", async () => {
  nextCode = 409;
  const r = await fetch(startUrl(), { method: "POST" });
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { ok: false, code: 409, reason: "port 3001 in use by row b" });
  assert.equal(calls.length, 1);
});

test("POST from another local origin is refused as a forbidden origin and the lifecycle is not called", async () => {
  const r = await fetch(startUrl(), {
    method: "POST",
    headers: { origin: "http://127.0.0.1:65000" },
  });
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), { error: "forbidden origin" });
  assert.equal(calls.length, 0);
});

test("POST from the hub's own origin is accepted", async () => {
  const r = await fetch(startUrl(), { method: "POST", headers: { origin: base } });
  assert.equal(r.status, 200);
  assert.equal(calls.length, 1);
});

test("POST with a wrong Host header is refused as a forbidden host and the lifecycle is not called", async () => {
  // Node's fetch drops a caller-set host header (measured on Node 24), so this uses http.request.
  const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
  /** @type {{ status: number | undefined, text: string }} */
  const { status, text } = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method: "POST",
        path: `/api/hub/rows/${ROW_A.id}/start`,
        headers: { host: "evil.test:80" },
      },
      (res) => {
        let chunks = "";
        res.on("data", (/** @type {Buffer} */ c) => {
          chunks += c.toString();
        });
        res.on("end", () => {
          resolve({ status: res.statusCode, text: chunks });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(status, 403);
  assert.deepEqual(JSON.parse(text), { error: "forbidden host" });
  assert.equal(calls.length, 0);
});

test("POST for an id not in the loaded rows is a 404 unknown row and the lifecycle is not called", async () => {
  const r = await fetch(`${base}/api/hub/rows/${"b".repeat(16)}/start`, { method: "POST" });
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { error: "unknown row" });
  assert.equal(calls.length, 0);
});

test("POST on an unknown path is a 404", async () => {
  const r = await fetch(`${base}/api/hub/rows/${ROW_A.id}/restart`, { method: "POST" });
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { error: "not found" });
  assert.equal(calls.length, 0);
});

test("POST stop calls the lifecycle stop with the resolved row", async () => {
  const r = await fetch(`${base}/api/hub/rows/${ROW_A.id}/stop`, { method: "POST" });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, code: 200, state: "off" });
  assert.deepEqual(calls, [{ op: "stop", row: ROW_A, rows: [ROW_A] }]);
});

test("a load that throws is answered with 500 and the error message", async () => {
  loadThrows = true;
  const r = await fetch(`${base}/api/hub/status`);
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { error: "registry unreadable" });
});

test("starting on a port already in use rejects with EADDRINUSE", async () => {
  const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
  await assert.rejects(startHubServer({ handler: () => {}, port }), { code: "EADDRINUSE" });
});
