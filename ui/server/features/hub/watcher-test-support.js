// Test support for the hub watcher tests (#93), not a test file itself: a fake project server
// on port 0, an editable row source, and a watcher that records every change and stops itself.
import http from "node:http";
import { EventEmitter } from "node:events";
import { makeWatcher, STREAM_PATH } from "./watcher.js";
import { withDeadline } from "../../core/http/test-deadline.js";

/** @typedef {import("./watcher.js").WatchRow} WatchRow */
/** @typedef {import("./watcher.js").WatchEntry} WatchEntry */

export const IDLE = { name: "alpha", path: "/p/alpha", state: "idle", sessions: 0, lastLine: "hi" };

/** Waits for the next `name` event on `em` (bounded).
 * @param {EventEmitter} em @param {string} name @returns {Promise<unknown>} */
export const next = (em, name) =>
  withDeadline(`event ${name}`, (r) => {
    em.once(name, r);
  });

/** A fake project server on 127.0.0.1:0 speaking the event stream; `mode` 404 answers like an
 * install without the stream route, "hang500" answers 500 with a body that never ends.
 * @param {import("node:test").TestContext} t
 * @param {{ mode?: "sse" | "404" | "hang500", first?: object | null }} [o] */
export async function fakeProject(t, { mode = "sse", first = IDLE } = {}) {
  const em = new EventEmitter();
  /** @type {Set<import("node:http").ServerResponse>} */
  const open = new Set();
  /** @type {import("node:http").IncomingMessage[]} */
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req);
    if (mode === "404" || req.url !== STREAM_PATH) {
      res.writeHead(404).end();
    } else {
      res.writeHead(mode === "hang500" ? 500 : 200, { "content-type": "text/event-stream" });
      open.add(res);
      res.on("close", () => {
        open.delete(res);
        em.emit("close");
      });
      if (first) res.write(`data: ${JSON.stringify(first)}\n\n`);
    }
    em.emit("request");
  });
  await new Promise((r) => {
    server.listen(0, "127.0.0.1", () => {
      r(undefined);
    });
  });
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const port = /** @type {import("node:net").AddressInfo} */ (server.address()).port;
  return {
    port,
    requests,
    openCount: () => open.size,
    /** @param {string} text */
    write: (text) => {
      for (const res of open) res.write(text);
    },
    /** @param {object} status */
    send: (status) => {
      for (const res of open) res.write(`data: ${JSON.stringify(status)}\n\n`);
    },
    dropAll: () => {
      for (const res of open) res.destroy();
    },
    nextRequest: () => next(em, "request"),
    nextClose: () => next(em, "close"),
  };
}

/** A row source the test edits, counting each read; `ticks(n)` waits for n more reads.
 * @param {WatchRow[]} initial */
export function rowSource(initial) {
  const em = new EventEmitter();
  let list = initial;
  let calls = 0;
  return {
    rows: () => {
      calls += 1;
      queueMicrotask(() => em.emit("call"));
      return list;
    },
    /** @param {WatchRow[]} l */
    set: (l) => {
      list = l;
    },
    calls: () => calls,
    /** @param {number} n */
    ticks: (n) =>
      withDeadline(`${n} row reads`, (r) => {
        const target = calls + n;
        const on = () => {
          if (calls < target) return;
          em.off("call", on);
          r(undefined);
        };
        em.on("call", on);
      }),
  };
}

/** @param {string} id @param {number} port @returns {WatchRow} */
export const on = (id, port) => ({ id, port, project: IDLE.path, state: "on" });

/** A watcher stopped when the test ends; `changes` records every notification.
 * @param {import("node:test").TestContext} t @param {import("./watcher.js").WatcherOptions} o */
export function watch(t, o) {
  const w = makeWatcher({ intervalMs: 5, ...o });
  /** @type {[string, WatchEntry | null][]} */
  const changes = [];
  const em = new EventEmitter();
  w.onChange((id, entry) => {
    changes.push([id, entry]);
    em.emit("change", [id, entry]);
  });
  t.after(() => {
    w.stop();
  });
  return {
    w,
    changes,
    nextChange: () => /** @type {Promise<[string, WatchEntry | null]>} */ (next(em, "change")),
  };
}

/** @param {WatchEntry | null | undefined} e */
export const stateOf = (e) => (e?.kind === "stream" ? e.status.state : e?.kind);
