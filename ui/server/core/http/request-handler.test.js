// The request dispatcher (#60) over a real port-0 server with fake deps: no route table, no
// session, no real server start.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { makeRequestHandler } from "./request-handler.js";

/** @type {string[]} */
const calls = [];
const PAYLOAD = { state: "idle", sessions: 0, lastLine: "secret question?" };
const { lastLine: _hidden, ...CROSS_ORIGIN_PAYLOAD } = PAYLOAD;
const server = http.createServer(
  makeRequestHandler({
    getRoutes: { "/api/state": () => (calls.push("state"), { ok: "state" }) },
    postRoutes: {},
    deleteSession: (id) => (calls.push(`delete:${id}`), true),
    handleAgentApi: (_req, res) => {
      res.end("agent");
    },
    serveStatic: (req, res) => {
      calls.push(`static:${req.url}`);
      res.end("static");
    },
    status: { path: "/api/status", payload: () => PAYLOAD },
  }),
);
let base = "";

before(async () => {
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(undefined);
    });
  });
  const addr = /** @type {import("node:net").AddressInfo} */ (server.address());
  base = `http://127.0.0.1:${addr.port}`;
});
after(async () => {
  await new Promise((resolve) => {
    server.close(() => {
      resolve(undefined);
    });
  });
});

test("GET route matches the pathname, query string stripped", async () => {
  const r = await fetch(`${base}/api/state?t=1`);
  assert.deepEqual(await r.json(), { ok: "state" });
  assert.ok(calls.includes("state"));
});

test("/api/status with no Origin (same-origin, curl): the full payload incl. lastLine", async () => {
  const r = await fetch(`${base}/api/status`);
  assert.deepEqual(await r.json(), PAYLOAD);
  assert.equal(r.headers.get("access-control-allow-origin"), null);
});

test("/api/status from a local Origin: no lastLine + allow-origin + Vary", async () => {
  const r = await fetch(`${base}/api/status`, { headers: { origin: "http://localhost:4000" } });
  assert.deepEqual(await r.json(), CROSS_ORIGIN_PAYLOAD);
  assert.equal(r.headers.get("content-type"), "application/json");
  assert.equal(r.headers.get("access-control-allow-origin"), "http://localhost:4000");
  assert.equal(r.headers.get("vary"), "Origin");
});

test("/api/status from a look-alike Origin: no lastLine, no CORS header", async () => {
  const r = await fetch(`${base}/api/status`, {
    headers: { origin: "http://localhost.evil.com:80" },
  });
  assert.deepEqual(await r.json(), CROSS_ORIGIN_PAYLOAD);
  assert.equal(r.headers.get("access-control-allow-origin"), null);
});

test("other GET routes never get CORS, even from a local Origin", async () => {
  const r = await fetch(`${base}/api/state`, { headers: { origin: "http://localhost:4000" } });
  await r.text();
  assert.equal(r.headers.get("access-control-allow-origin"), null);
  assert.equal(r.headers.get("vary"), null);
});

test("DELETE /api/sessions/:id calls deleteSession with the id", async () => {
  const r = await fetch(`${base}/api/sessions/abc`, { method: "DELETE" });
  assert.deepEqual(await r.json(), { deleted: true });
  assert.ok(calls.includes("delete:abc"));
});

test("an unknown path falls through to serveStatic", async () => {
  const r = await fetch(`${base}/nope.html`);
  assert.equal(await r.text(), "static");
  assert.ok(calls.includes("static:/nope.html"));
});
