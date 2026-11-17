// The hub's HTTP handler over real port-0 servers with fake load, aggregate and lifecycle; the
// stream tests add a fake project serving its own status stream, which the hub's watcher follows.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { closeHub, makeHubFeed, makeHubHandler, makeHubStream, startHubServer } from "./server.js";
import { parseEvents } from "./watcher.js";
import { makeStatusStream } from "../../core/http/status-stream.js";
import { withDeadline } from "../../core/http/test-deadline.js";
import { ask } from "./hub-test-http.js";

/** @type {import("./rows.js").HubRow} */
const ROW_A = {
  id: "a".repeat(16),
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
const load = () => {
  reads.push("load");
  return { rows: [ROW_A], errors: ERRORS };
};
const feed = makeHubFeed({
  load,
  aggregate: async (rows) => {
    reads.push("aggregate");
    return { rows: rows.map((r) => ({ ...r, state: /** @type {const} */ ("off") })), at: AT };
  },
});
const deps = {
  load,
  feed,
  stream: makeHubStream(feed),
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
  feed.stop();
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

test("starting on a port already in use rejects with EADDRINUSE", async () => {
  const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
  await assert.rejects(startHubServer({ handler: () => {}, port }), { code: "EADDRINUSE" });
});

const hubPort = () => /** @type {import("node:net").AddressInfo} */ (server.address()).port;

for (const path of ["/api/hub/status", "/api/hub/ping", "/api/hub/stream"]) {
  test(`GET ${path} is refused with 403 for a foreign Host or Origin and served for the hub's own`, async () => {
    const port = hubPort();
    const own = `127.0.0.1:${port}`;
    assert.equal((await ask(port, path, { host: own, origin: `http://${own}` })).status, 200);
    const host = await ask(port, path, { host: "evil.test:80" });
    assert.deepEqual([host.status, JSON.parse(host.text)], [403, { error: "forbidden host" }]);
    const origin = await ask(port, path, { host: own, origin: "http://127.0.0.1:65000" });
    assert.deepEqual(
      [origin.status, JSON.parse(origin.text)],
      [403, { error: "forbidden origin" }],
    );
  });
}

/** A project server whose status the test edits; it serves only /api/status/stream.
 * @param {{ path?: string }} [o] */
async function fakeProject({ path = "/tmp/project-a" } = {}) {
  let current = {
    name: "alpha",
    path,
    domain: "webapp",
    port: 0,
    pid: 1,
    state: "idle",
    sessions: 1,
    lastLine: "",
    at: AT,
  };
  /** @type {Set<() => void>} */
  const listeners = new Set();
  const stream = makeStatusStream({
    payload: () => current,
    subscribe: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  });
  const { server: s } = await startHubServer({ handler: stream.handle, port: 0 });
  const port = /** @type {import("node:net").AddressInfo} */ (s.address()).port;
  return {
    port,
    status: () => current,
    /** @param {Partial<typeof current>} patch */
    set: (patch) => {
      current = { ...current, ...patch, at: new Date().toISOString() };
      for (const l of [...listeners]) l();
    },
    close: () => {
      stream.closeAll();
      return new Promise((r) => {
        s.close(r);
      });
    },
  };
}

/** A hub over one row on the project's port; `state` is what the next aggregate says.
 * @param {{ port: number, status: () => unknown } | null} project
 * @param {{ load?: () => { rows: import("./rows.js").HubRow[], errors: [] } }} [o] */
async function streamHub(project, o = {}) {
  const row = { ...ROW_A, port: project?.port ?? 1 };
  const box = { state: /** @type {"on" | "off"} */ ("on") };
  const f = makeHubFeed({
    load: o.load ?? (() => ({ rows: [row], errors: [] })),
    aggregate: async (rows) => ({
      rows: rows.map((r) =>
        box.state === "on"
          ? { ...r, state: box.state, status: /** @type {any} */ (project?.status()) }
          : { ...r, state: box.state },
      ),
      at: new Date().toISOString(),
    }),
  });
  const stream = makeHubStream(f);
  const hubDeps = {
    ...deps,
    load: () => ({ rows: [row], errors: [] }),
    feed: f,
    stream,
    ownHost: "",
  };
  const started = await startHubServer({ handler: makeHubHandler(hubDeps), port: 0 });
  hubDeps.ownHost = started.address.slice("http://".length);
  const port = /** @type {import("node:net").AddressInfo} */ (started.server.address()).port;
  return { box, feed: f, port, close: () => closeHub({ server: started.server, feed: f, stream }) };
}

/** A reader of the hub stream: `next` is the next event's JSON, `ended` the response's end.
 */
/** @typedef {{ id: string, state: string, port?: number, status?: { state: string, path: string, lastLine: string } }} HubEventRow */
/** @typedef {{ rows: HubEventRow[] }} HubEvent */

/** @param {number} port */
function reader(port) {
  /** @type {HubEvent[]} */
  const events = [];
  /** @type {(() => void)[]} */
  const waiters = [];
  /** @type {() => void} */
  let markEnded = () => {};
  const ended = new Promise((r) => {
    markEnded = () => {
      r(undefined);
    };
  });
  const req = http.get(
    { host: "127.0.0.1", port, path: "/api/hub/stream", agent: false },
    (res) => {
      res.setEncoding("utf8");
      let buffer = "";
      res.on("data", (/** @type {string} */ c) => {
        const { datas, rest } = parseEvents(buffer + c);
        buffer = rest;
        for (const d of datas) {
          /** @type {unknown} */
          const event = JSON.parse(d);
          events.push(/** @type {HubEvent} */ (event));
        }
        waiters.splice(0).forEach((w) => {
          w();
        });
      });
      res.on("end", markEnded);
    },
  );
  req.on("error", () => {});
  return {
    /** @param {string} label @returns {Promise<HubEvent>} */
    next: (label) =>
      withDeadline(
        label,
        (resolve) => {
          const take = () => {
            const event = events.shift();
            if (event) resolve(event);
            else waiters.push(take);
          };
          take();
        },
        () => req.destroy(),
      ),
    ended: () =>
      withDeadline("the stream response to end", (r) => {
        void ended.then(r);
      }),
    destroy: () => req.destroy(),
  };
}

test("the stream sends the rows at connect, and a project's status change reaches the reader", async () => {
  const project = await fakeProject();
  const hub = await streamHub(project);
  const r = reader(hub.port);
  const first = await r.next("the connect event");
  assert.deepEqual(
    [first.rows[0]?.id, first.rows[0]?.state, first.rows[0]?.status?.state],
    [ROW_A.id, "on", "idle"],
  );
  await hub.feed.refresh(); // the watcher opens the project's stream
  project.set({ state: "waiting", lastLine: "ok to deploy?" });
  const changed = await r.next("the change event");
  assert.deepEqual(
    [changed.rows[0]?.status?.state, changed.rows[0]?.status?.lastLine],
    ["waiting", "ok to deploy?"],
  );
  r.destroy();
  await hub.close();
  await project.close();
});

test("a row turning off reaches the reader, and a refresh that changes nothing sends nothing", async () => {
  const project = await fakeProject();
  const hub = await streamHub(project);
  const r = reader(hub.port);
  await r.next("the connect event");
  await hub.feed.refresh();
  await hub.feed.refresh(); // new `at` values only
  hub.box.state = "off";
  await hub.feed.refresh();
  const next = await r.next("the off event");
  assert.equal(next.rows[0]?.state, "off");
  assert.equal(next.rows[0]?.status, undefined);
  r.destroy();
  await hub.close();
  await project.close();
});

test("GET status answers the same rows as the stream's latest event", async () => {
  const project = await fakeProject();
  const hub = await streamHub(project);
  const r = reader(hub.port);
  await r.next("the connect event");
  await hub.feed.refresh();
  project.set({ state: "working" });
  const latest = await r.next("the change event");
  const status = await ask(hub.port, "/api/hub/status", { host: `127.0.0.1:${hub.port}` });
  assert.deepEqual(JSON.parse(status.text), latest);
  r.destroy();
  await hub.close();
  await project.close();
});

test("a row that keeps its id but moves to another project and port never shows the old project's status", async (t) => {
  const a = await fakeProject();
  const b = await fakeProject({ path: "/tmp/project-b" });
  t.after(() => Promise.all([a.close(), b.close()]));
  let probed = a;
  let row = { ...ROW_A, port: a.port };
  const probe = { port: a.port, status: () => probed.status() };
  const hub = await streamHub(probe, { load: () => ({ rows: [row], errors: [] }) });
  const r = reader(hub.port);
  t.after(() => {
    r.destroy();
    return hub.close();
  });
  await r.next("the connect event");
  await hub.feed.refresh(); // the watcher opens a's stream
  a.set({ state: "waiting", lastLine: "old question?" });
  await r.next("a's waiting event");
  probed = b;
  row = { ...ROW_A, project: "/tmp/project-b", port: b.port };
  await hub.feed.refresh();
  const moved = /** @type {HubEventRow} */ ((await r.next("the moved row's first event")).rows[0]);
  assert.deepEqual(
    [moved.port, moved.status?.path, moved.status?.state, moved.status?.lastLine],
    [b.port, "/tmp/project-b", "idle", ""],
  );
});

test("closing the hub with a reader connected ends the response and lets the server close", async () => {
  const hub = await streamHub(null);
  const r = reader(hub.port);
  await r.next("the connect event");
  await withDeadline("the hub to close", (resolve) => void hub.close().then(resolve));
  await r.ended();
});

test("a load that throws before any read is answered with 500 on status and stream", async () => {
  const hub = await streamHub(null, {
    load: () => {
      throw new Error("registry unreadable");
    },
  });
  const host = { host: `127.0.0.1:${hub.port}` };
  for (const path of ["/api/hub/status", "/api/hub/stream"]) {
    const res = await ask(hub.port, path, host);
    assert.deepEqual([res.status, JSON.parse(res.text)], [500, { error: "registry unreadable" }]);
  }
  await hub.close();
});
