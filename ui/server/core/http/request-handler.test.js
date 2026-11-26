// The request dispatcher (#60) over a real port-0 server with fake deps: no route table, no
// session, no real server start.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { makeRequestHandler } from "./request-handler.js";
import { withDeadline } from "./test-deadline.js";

/** @type {string[]} */
const calls = [];
/** @type {string[]} */
const streamCalls = [];
/** @type {number[]} */
const payloadCalls = [];
const PAYLOAD = { state: "idle", sessions: 0, lastLine: "secret question?" };
const { lastLine: _hidden, ...CROSS_ORIGIN_PAYLOAD } = PAYLOAD;
const server = http.createServer(
  makeRequestHandler({
    getRoutes: {
      "/api/state": () => (calls.push("state"), { ok: "state" }),
      "/api/both": () => (calls.push("both:get"), { ok: "both:get" }),
    },
    postRoutes: {
      "/api/post": (_req, res) => {
        calls.push("post");
        res.end("post");
      },
      "/api/both": (_req, res) => {
        calls.push("both:post");
        res.end("both:post");
      },
    },
    deleteSession: (id) => (calls.push(`delete:${id}`), true),
    handleAgentApi: (_req, res, url) => {
      calls.push(`agent:${url}`);
      res.end("agent");
    },
    serveStatic: (req, res) => {
      calls.push(`static:${req.url}`);
      res.end("static");
    },
    status: {
      path: "/api/status",
      payload: () => (payloadCalls.push(1), PAYLOAD),
      streamPath: "/api/status/stream",
      stream: (req, res) => {
        streamCalls.push(req.url ?? "");
        res.end("stream");
      },
    },
  }),
);
let base = "";
let port = 0;

/** A request with a forged Host (fetch cannot set Host), to the real 127.0.0.1 listener.
 * @param {string} path @param {string} host @param {string} [method]
 * @param {Record<string, string>} [extra] more request headers, sent as given (even an empty value)
 * @returns {Promise<{ status: number, body: string }>} */
function rawRequest(path, host, method = "GET", extra = {}) {
  /** @type {http.ClientRequest | undefined} */
  let req;
  return withDeadline(
    `the complete response to ${method} ${path} (Host ${host})`,
    (resolve, reject) => {
      req = http.request(
        { host: "127.0.0.1", port, path, method, headers: { ...extra, host } },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => {
            resolve({ status: res.statusCode ?? 0, body });
          });
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.end();
    },
    () => req?.destroy(),
  );
}

/** Reset the status call counters before a Host test. */
function resetStatusCalls() {
  payloadCalls.length = 0;
  streamCalls.length = 0;
}

before(async () => {
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(undefined);
    });
  });
  const addr = /** @type {import("node:net").AddressInfo} */ (server.address());
  port = addr.port;
  base = `http://127.0.0.1:${port}`;
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

test("/api/status with an empty Origin header: no lastLine; beside it no Origin keeps it", async () => {
  const host = `127.0.0.1:${port}`;
  const empty = await rawRequest("/api/status", host, "GET", { origin: "" });
  const none = await rawRequest("/api/status", host);
  assert.deepEqual(JSON.parse(empty.body), CROSS_ORIGIN_PAYLOAD);
  assert.deepEqual(JSON.parse(none.body), PAYLOAD);
});

test("other GET routes never get CORS: a foreign local Origin gets 403, route not run", async () => {
  const callsBefore = calls.length;
  const r = await fetch(`${base}/api/state`, { headers: { origin: "http://localhost:4000" } });
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), { error: "forbidden origin" });
  assert.equal(calls.length, callsBefore);
  assert.equal(r.headers.get("access-control-allow-origin"), null);
  assert.equal(r.headers.get("vary"), null);
});

test("DELETE /api/sessions/:id calls deleteSession with the id", async () => {
  const r = await fetch(`${base}/api/sessions/abc`, { method: "DELETE" });
  assert.deepEqual(await r.json(), { deleted: true });
  assert.ok(calls.includes("delete:abc"));
});

test("GET /api/status/stream reaches the stream handler", async () => {
  streamCalls.length = 0;
  const r = await fetch(`${base}/api/status/stream`);
  assert.equal(await r.text(), "stream");
  assert.deepEqual(streamCalls, ["/api/status/stream"]);
});

test("GET /api/status/stream?t=1 still reaches the stream handler (pathname match)", async () => {
  streamCalls.length = 0;
  const r = await fetch(`${base}/api/status/stream?t=1`);
  assert.equal(await r.text(), "stream");
  assert.deepEqual(streamCalls, ["/api/status/stream?t=1"]);
});

test("POST /api/status/stream is refused: 405, allow GET, handler never called", async () => {
  streamCalls.length = 0;
  const r = await fetch(`${base}/api/status/stream`, { method: "POST" });
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("allow"), "GET");
  assert.deepEqual(await r.json(), { error: "method not allowed" });
  assert.equal(streamCalls.length, 0);
});

test("/api/status still answers the snapshot, not the stream", async () => {
  streamCalls.length = 0;
  const r = await fetch(`${base}/api/status`);
  assert.deepEqual(await r.json(), PAYLOAD);
  assert.equal(streamCalls.length, 0);
});

test("an unknown path falls through to serveStatic", async () => {
  const r = await fetch(`${base}/nope.html`);
  assert.equal(await r.text(), "static");
  assert.ok(calls.includes("static:/nope.html"));
});

test("/api/status from a foreign Host (DNS rebinding): 403, payload never built", async () => {
  resetStatusCalls();
  const r = await rawRequest("/api/status", `evil.example:${port}`);
  assert.equal(r.status, 403);
  assert.deepEqual(JSON.parse(r.body), { error: "forbidden host" });
  assert.equal(payloadCalls.length, 0);
});

test("GET /api/status/stream from a foreign Host: 403, stream handler never called", async () => {
  resetStatusCalls();
  const r = await rawRequest("/api/status/stream", `localhost.evil.example:${port}`);
  assert.equal(r.status, 403);
  assert.deepEqual(JSON.parse(r.body), { error: "forbidden host" });
  assert.equal(streamCalls.length, 0);
});

test("POST /api/status/stream from a foreign Host: the Host check comes before the 405", async () => {
  resetStatusCalls();
  const r = await rawRequest("/api/status/stream", `evil.example:${port}`, "POST");
  assert.equal(r.status, 403);
  assert.equal(streamCalls.length, 0);
});

test("/api/status with Host: localhost (no port, as on port 80) answers 200", async () => {
  resetStatusCalls();
  const r = await rawRequest("/api/status", "localhost");
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(r.body), PAYLOAD);
  assert.equal(payloadCalls.length, 1);
});

test("both status routes still answer on 127.0.0.1:<port> and localhost:<port>", async () => {
  for (const host of [`127.0.0.1:${port}`, `localhost:${port}`]) {
    resetStatusCalls();
    const snap = await rawRequest("/api/status", host);
    assert.equal(snap.status, 200, host);
    assert.deepEqual(JSON.parse(snap.body), PAYLOAD);
    assert.equal(payloadCalls.length, 1, host);
    const stream = await rawRequest("/api/status/stream", host);
    assert.equal(stream.body, "stream", host);
    assert.equal(streamCalls.length, 1, host);
  }
});

/** The requests a foreign Origin or Host must never let through: one per dispatch branch. */
const GUARDED = /** @type {const} */ ([
  ["POST", "/api/post"],
  ["DELETE", "/api/sessions/s1"],
  ["POST", "/api/agents/x/check"],
  ["GET", "/api/state"],
  ["GET", "/index.html"],
]);

test("#89 a foreign Origin on every non-status route: 403, handler never called", async () => {
  const host = `127.0.0.1:${port}`;
  const before = calls.length;
  for (const [method, path] of GUARDED) {
    const r = await rawRequest(path, host, method, { origin: "http://evil.example" });
    assert.equal(r.status, 403, `${method} ${path}`);
    assert.deepEqual(JSON.parse(r.body), { error: "forbidden origin" }, `${method} ${path}`);
  }
  assert.equal(calls.length, before);
});

test("#89 a foreign Host on every non-status route: 403, handler never called", async () => {
  const before = calls.length;
  for (const [method, path] of GUARDED) {
    const r = await rawRequest(path, `evil.example:${port}`, method);
    assert.equal(r.status, 403, `${method} ${path}`);
    assert.deepEqual(JSON.parse(r.body), { error: "forbidden host" }, `${method} ${path}`);
  }
  assert.equal(calls.length, before);
});

test("#89 the own Origin, or no Origin: POST, DELETE and a read route work as before", async () => {
  const host = `127.0.0.1:${port}`;
  const cases = /** @type {const} */ ([
    ["POST", "/api/post", "post", "post"],
    ["DELETE", "/api/sessions/s1", "delete:s1", '{"deleted":true}'],
    ["POST", "/api/agents/x/check", "agent:/api/agents/x/check", "agent"],
    ["GET", "/api/state", "state", '{"ok":"state"}'],
  ]);
  for (const extra of /** @type {Record<string, string>[]} */ ([
    { origin: `http://${host}` },
    {},
  ])) {
    for (const [method, path, call, body] of cases) {
      const before = calls.length;
      const r = await rawRequest(path, host, method, extra);
      assert.equal(r.status, 200, `${method} ${path} ${JSON.stringify(extra)}`);
      assert.equal(r.body, body, `${method} ${path}`);
      assert.deepEqual(calls.slice(before), [call], `${method} ${path}`);
    }
  }
});

test("#89 a path in both tables: POST reaches the POST handler, not the read producer", async () => {
  const before = calls.length;
  const r = await rawRequest("/api/both", `127.0.0.1:${port}`, "POST");
  assert.equal(r.body, "both:post");
  assert.deepEqual(calls.slice(before), ["both:post"]);
});

test("#89 a path in both tables: GET still reaches the read producer", async () => {
  const before = calls.length;
  const r = await rawRequest("/api/both", `127.0.0.1:${port}`);
  assert.equal(r.body, '{"ok":"both:get"}');
  assert.deepEqual(calls.slice(before), ["both:get"]);
});
