// Shutdown of the hub server (#93): a request still waiting for the first rows when closeHub runs
// is answered instead of holding the server open.
import { test } from "node:test";
import assert from "node:assert/strict";
import { closeHub, makeHubFeed, makeHubHandler, makeHubStream, startHubServer } from "./server.js";
import { withDeadline } from "../../core/http/test-deadline.js";
import { ask } from "./hub-test-http.js";

/** @type {import("./rows.js").HubRow} */
const ROW = {
  id: "a".repeat(16),
  install: "/tmp/install-a",
  name: "install-a",
  project: "/tmp/project-a",
  port: 1,
  domain: null,
};

test("status and stream requests waiting for the first rows get 503 at shutdown and the hub closes", async () => {
  const load = () => ({ rows: [ROW], errors: [] });
  // The first read never finishes, so both requests are still waiting when the hub closes.
  const feed = makeHubFeed({ load, aggregate: () => new Promise(() => {}) });
  const stream = makeHubStream(feed);
  const refuse = () => Promise.reject(new Error("not used"));
  const deps = { load, feed, stream, lifecycle: { start: refuse, stop: refuse }, ownHost: "" };
  const { server, address } = await startHubServer({ handler: makeHubHandler(deps), port: 0 });
  deps.ownHost = address.slice("http://".length);
  const port = /** @type {import("node:net").AddressInfo} */ (server.address()).port;
  let seen = 0;
  const bothArrived = withDeadline("both requests to arrive", (resolve) => {
    server.on("request", () => {
      if (++seen === 2) resolve();
    });
  });
  const host = { host: deps.ownHost };
  const answers = Promise.all([
    ask(port, "/api/hub/status", host),
    ask(port, "/api/hub/stream", host),
  ]);
  await bothArrived;
  const closed = closeHub({ server, feed, stream });
  const [status, streamed] = await answers;
  const refused = { error: "hub is shutting down" };
  assert.deepEqual([status.status, JSON.parse(status.text)], [503, refused]);
  assert.deepEqual([streamed.status, JSON.parse(streamed.text)], [503, refused]);
  await withDeadline("the hub to close", (resolve) => void closed.then(resolve));
});

test("a stream reader that leaves during the first read is never subscribed", async (t) => {
  const load = () => ({ rows: [ROW], errors: [] });
  /** @type {(v: { rows: [], at: string }) => void} */
  let finishRead = () => {};
  const aggregate = () =>
    /** @type {Promise<{ rows: [], at: string }>} */ (
      new Promise((resolve) => {
        finishRead = resolve;
      })
    );
  const feed = makeHubFeed({ load, aggregate });
  let live = 0;
  /** @param {() => void} l */
  const subscribe = (l) => {
    live += 1;
    const off = feed.subscribe(l);
    return () => {
      live -= 1;
      off();
    };
  };
  const inner = makeHubStream({ ...feed, subscribe });
  /** @type {() => void} */
  let handled = () => {};
  const handledOnce = withDeadline("the stream handle call", (resolve) => {
    handled = resolve;
  });
  /** @type {import("./server.js").HubStream} */
  const stream = {
    handle: (req, res) => {
      inner.handle(req, res);
      handled();
    },
    closeAll: inner.closeAll,
  };
  const refuse = () => Promise.reject(new Error("not used"));
  const deps = { load, feed, stream, lifecycle: { start: refuse, stop: refuse }, ownHost: "" };
  const { server, address } = await startHubServer({ handler: makeHubHandler(deps), port: 0 });
  t.after(() => closeHub({ server, feed, stream }));
  deps.ownHost = address.slice("http://".length);
  const port = /** @type {import("node:net").AddressInfo} */ (server.address()).port;
  // The reader's connection drops while the first read is still pending.
  const readerLeft = withDeadline("the reader to leave", (resolve) => {
    server.on("request", (req, res) => {
      res.on("close", resolve);
      req.socket.destroy();
    });
  });
  ask(port, "/api/hub/stream", { host: deps.ownHost }).catch(() => {});
  await readerLeft;
  finishRead({ rows: [], at: "t0" });
  await handledOnce;
  assert.equal(live, 0);
});
