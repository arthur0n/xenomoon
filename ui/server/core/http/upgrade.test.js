// The session WebSocket answers on `/` only (#92): every other upgrade path is refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { attachSessionUpgrade } from "./upgrade.js";
import { withDeadline } from "./test-deadline.js";

/** A loopback http server with a noServer wss behind the upgrade door; counts `connection`s.
 * Its stop is registered on `t` before the first await, so it runs even when a wait fails.
 * @param {import("node:test").TestContext} t */
async function start(t) {
  const server = http.createServer((_req, res) => {
    res.end("ok");
  });
  const wss = new WebSocketServer({ noServer: true });
  /** @type {import("node:http").IncomingMessage[]} */
  const conns = [];
  wss.on("connection", (_ws, req) => {
    conns.push(req);
  });
  attachSessionUpgrade(server, wss);
  /** @type {WebSocket[]} */
  const clients = [];
  t.after(async () => {
    for (const c of clients) c.terminate();
    for (const c of wss.clients) c.terminate();
    await withDeadline("wss.close", (r) => {
      wss.close(() => {
        r();
      });
    });
    server.closeAllConnections();
    if (!server.listening) return;
    await withDeadline("server.close", (r) => {
      server.close(() => {
        r();
      });
    });
  });
  await withDeadline("the server to listen", (r) => {
    server.listen(0, "127.0.0.1", () => {
      r();
    });
  });
  const addr = /** @type {import("node:net").AddressInfo} */ (server.address());
  return {
    wss,
    conns,
    /** @param {string} path */
    client(path) {
      const ws = new WebSocket(`ws://127.0.0.1:${addr.port}${path}`);
      clients.push(ws);
      return ws;
    },
  };
}

/** Resolves "open", or the refusal's HTTP status; terminates the socket on timeout.
 * @param {WebSocket} ws @returns {Promise<"open" | number | undefined>} */
function outcome(ws) {
  return withDeadline(
    `the upgrade outcome for ${ws.url}`,
    /** @type {(resolve: (v: "open" | number | undefined) => void, reject: (err: Error) => void) => void} */
    (resolve, reject) => {
      ws.once("open", () => {
        resolve("open");
      });
      ws.once("unexpected-response", (_req, res) => {
        resolve(res.statusCode);
      });
      ws.once("error", reject);
    },
    () => {
      ws.terminate();
    },
  );
}

test("an upgrade on / connects and fires connection", async (t) => {
  const s = await start(t);
  assert.equal(await outcome(s.client("/")), "open");
  assert.equal(s.conns.length, 1);
  assert.equal(s.conns[0]?.url, "/");
});

test("an upgrade on /?resume=abc connects and the handler sees that url", async (t) => {
  const s = await start(t);
  assert.equal(await outcome(s.client("/?resume=abc")), "open");
  assert.equal(s.conns.length, 1);
  assert.equal(s.conns[0]?.url, "/?resume=abc");
});

test("an upgrade on /api/status/stream is refused with 400 and no connection", async (t) => {
  const s = await start(t);
  assert.equal(await outcome(s.client("/api/status/stream")), 400);
  assert.equal(s.conns.length, 0);
});

test("an upgrade on another path (with a resume query) is refused with 400", async (t) => {
  const s = await start(t);
  assert.equal(await outcome(s.client("/anything?resume=abc")), 400);
  assert.equal(await outcome(s.client("/api/status")), 400);
  assert.equal(s.conns.length, 0);
});

test("after a refusal the server holds no client, and / still connects", async (t) => {
  const s = await start(t);
  assert.equal(await outcome(s.client("/api/status/stream")), 400);
  assert.equal(s.wss.clients.size, 0);
  assert.equal(s.conns.length, 0);
  assert.equal(await outcome(s.client("/")), "open");
  assert.equal(s.wss.clients.size, 1);
});
