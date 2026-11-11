// runHub in-process on port 0: the listening line and status, the second-hub exit 0 (also while the
// running hub's status would stall), the stranger
// exit 1, and an invalid registry surfacing as one error with a sidecar file.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runHub } from "./hub.js";

/** @type {import("node:http").Server[]} */
const servers = [];
after(() =>
  Promise.all(
    servers.map(
      (s) =>
        new Promise((r) =>
          s.close(() => {
            r(undefined);
          }),
        ),
    ),
  ),
);

/** @param {string} text */
function fixture(text) {
  const dir = mkdtempSync(path.join(tmpdir(), "hub-cli-"));
  const registryFile = path.join(dir, "installs.json");
  writeFileSync(registryFile, text);
  return { registryFile, sidecarDir: path.join(dir, "sidecars") };
}

function recorder() {
  /** @type {string[]} */
  const lines = [];
  /** @type {number[]} */
  const codes = [];
  return {
    lines,
    codes,
    log: (/** @type {string} */ l) => lines.push(l),
    exit: (/** @type {number} */ c) => codes.push(c),
  };
}

/** @param {string} text @param {Partial<import("./hub.js").HubOptions>} [extra] */
async function startHub(text, extra = {}) {
  const rec = recorder();
  const started = await runHub({
    port: 0,
    ...fixture(text),
    log: rec.log,
    exit: rec.exit,
    ...extra,
  });
  if (started) servers.push(started.server);
  return { started, rec };
}

const EMPTY = '{"version":1,"installs":{}}';

/** @param {string} address @returns {Promise<{ rows: unknown[], errors: { reason: string }[], at: unknown }>} */
async function status(address) {
  /** @type {unknown} */
  const body = await (await fetch(`${address}/api/hub/status`)).json();
  return /** @type {{ rows: unknown[], errors: { reason: string }[], at: unknown }} */ (body);
}

test("a hub on a free port logs one listening line and answers an empty status", async () => {
  const { started, rec } = await startHub(EMPTY);
  assert.ok(started);
  assert.deepEqual(rec.lines, [`hub listening at ${started.address}`]);
  assert.match(started.address, /^http:\/\/127\.0\.0\.1:\d+$/);
  const body = await status(started.address);
  assert.deepEqual(body.rows, []);
  assert.deepEqual(body.errors, []);
  assert.equal(typeof body.at, "string");
  assert.deepEqual(rec.codes, []);
});

test("a second hub on the port of a running hub reports it and exits 0 without listening", async () => {
  const { started: first } = await startHub(EMPTY);
  assert.ok(first);
  const port = Number(new URL(first.address).port);
  const { started: second, rec } = await startHub(EMPTY, { port });
  assert.equal(second, null);
  assert.deepEqual(rec.lines, [`hub already running at http://127.0.0.1:${port}`]);
  assert.deepEqual(rec.codes, [0]);
});

test("a second hub exits 0 within the probe budget while the running hub's status would stall", async () => {
  // A project server that accepts connections and never answers: status would wait on it.
  const stall = http.createServer(() => {});
  await new Promise((r) =>
    stall.listen(0, "127.0.0.1", () => {
      r(undefined);
    }),
  );
  const stallPort = /** @type {import("node:net").AddressInfo} */ (stall.address()).port;
  /** @type {import("../features/hub/rows.js").HubRow} */
  const row = {
    id: "s".repeat(16),
    kind: "install",
    install: "/tmp/install-stall",
    name: "install-stall",
    project: "/tmp/project-stall",
    port: stallPort,
    domain: null,
  };
  const { started: first } = await startHub(EMPTY, { load: () => ({ rows: [row], errors: [] }) });
  assert.ok(first);
  const port = Number(new URL(first.address).port);
  const t0 = performance.now();
  const { started: second, rec } = await startHub(EMPTY, { port });
  const elapsed = performance.now() - t0;
  stall.closeAllConnections();
  stall.close();
  assert.equal(second, null);
  assert.deepEqual(rec.lines, [`hub already running at http://127.0.0.1:${port}`]);
  assert.deepEqual(rec.codes, [0]);
  assert.ok(elapsed < 1000, `second hub took ${Math.round(elapsed)} ms`);
});

test("a port held by a server that is not a hub is refused with exit 1", async () => {
  const stranger = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("hello");
  });
  servers.push(stranger);
  await new Promise((r) =>
    stranger.listen(0, "127.0.0.1", () => {
      r(undefined);
    }),
  );
  const port = /** @type {import("node:net").AddressInfo} */ (stranger.address()).port;
  const { started, rec } = await startHub(EMPTY, { port });
  assert.equal(started, null);
  assert.deepEqual(rec.lines, [`port ${port} is held by another server; set XENOMOON_HUB_PORT`]);
  assert.deepEqual(rec.codes, [1]);
});

test("a stranger answering 200 JSON without hub true is not taken for a hub", async () => {
  const stranger = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
  servers.push(stranger);
  await new Promise((r) =>
    stranger.listen(0, "127.0.0.1", () => {
      r(undefined);
    }),
  );
  const port = /** @type {import("node:net").AddressInfo} */ (stranger.address()).port;
  const { started, rec } = await startHub(EMPTY, { port });
  assert.equal(started, null);
  assert.deepEqual(rec.lines, [`port ${port} is held by another server; set XENOMOON_HUB_PORT`]);
  assert.deepEqual(rec.codes, [1]);
});

test("an invalid registry gives no rows, one invalid JSON error and a sidecar file", async () => {
  const fx = fixture("{not json");
  const rec = recorder();
  const started = await runHub({ port: 0, ...fx, log: rec.log, exit: rec.exit });
  assert.ok(started);
  servers.push(started.server);
  const body = await status(started.address);
  assert.deepEqual(body.rows, []);
  assert.equal(body.errors.length, 1);
  assert.match(body.errors[0]?.reason ?? "", /invalid JSON/);
  assert.equal(readdirSync(fx.sidecarDir).filter((f) => f.endsWith(".error")).length, 1);
});

/** A port that was free a moment ago. @returns {Promise<number>} */
async function freePort() {
  const s = http.createServer();
  await new Promise((r) =>
    s.listen(0, "127.0.0.1", () => {
      r(undefined);
    }),
  );
  const port = /** @type {import("node:net").AddressInfo} */ (s.address()).port;
  await new Promise((r) =>
    s.close(() => {
      r(undefined);
    }),
  );
  return port;
}

test("a refused probe on a fixed port means the hub listens on that port", async () => {
  const port = await freePort();
  const { started, rec } = await startHub(EMPTY, { port });
  assert.ok(started);
  assert.deepEqual(rec.lines, [`hub listening at http://127.0.0.1:${port}`]);
  assert.deepEqual(rec.codes, []);
});

test("a port taken between the probe and listen is refused with exit 1", async () => {
  const stranger = http.createServer();
  servers.push(stranger);
  await new Promise((r) =>
    stranger.listen(0, "127.0.0.1", () => {
      r(undefined);
    }),
  );
  const port = /** @type {import("node:net").AddressInfo} */ (stranger.address()).port;
  const refused = () =>
    Promise.reject(
      Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }),
    );
  const { started, rec } = await startHub(EMPTY, { port, fetchImpl: refused });
  assert.equal(started, null);
  assert.deepEqual(rec.lines, [`port ${port} is held by another server; set XENOMOON_HUB_PORT`]);
  assert.deepEqual(rec.codes, [1]);
});
