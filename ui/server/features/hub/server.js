// The hub's own HTTP surface: GET /api/hub/status, GET /api/hub/stream (the same rows as events),
// GET /api/hub/ping (a constant "I am a hub" answer for the second hub's probe), POST
// /api/hub/rows/<id>/start|stop. Every GET and every start/stop is refused unless Host is the hub's
// own and Origin is absent or the hub's own (guardError), so a page on another local port cannot read
// or drive the hub. Ids resolve only through load().rows. Status and stream read one feed.
import http from "node:http";
import { makeStatusStream } from "../../core/http/status-stream.js";
import { makeWatcher } from "./watcher.js";

/** @typedef {import("./rows.js").HubRow} HubRow */
/** @typedef {import("./rows.js").HubError} HubError */
/** @typedef {import("./lifecycle.js").OpResult} OpResult */
/** @typedef {import("./status.js").HubRowStatus} HubRowStatus */
/** @typedef {import("./watcher.js").WatchEntry} WatchEntry */
/** @typedef {import("node:http").IncomingMessage} Req */
/** @typedef {import("node:http").ServerResponse} Res */
/** A row as status and stream show it; `watch` is set on an "on" row whose project has no stream.
 * @typedef {HubRowStatus & { watch?: "no-stream" }} HubViewRow */
/** @typedef {{ rows: HubViewRow[], errors: HubError[], at: string }} HubView */
/**
 * @typedef {{
 *   start: () => Promise<void>,
 *   refresh: () => Promise<void>,
 *   ready: () => Promise<boolean>,
 *   view: () => HubView,
 *   subscribe: (listener: () => void) => () => void,
 *   stop: () => void,
 * }} HubFeed
 */
/** @typedef {{ handle: (req: Req, res: Res) => void, closeAll: () => void }} HubStream */
/**
 * @typedef {{
 *   load: () => { rows: HubRow[], errors: HubError[] },
 *   feed: HubFeed,
 *   stream: HubStream,
 *   lifecycle: {
 *     start: (row: HubRow, rows: HubRow[]) => Promise<OpResult>,
 *     stop: (row: HubRow, rows: HubRow[]) => Promise<OpResult>,
 *   },
 *   ownHost: string,
 * }} HubDeps
 */

const STATUS_PATH = "/api/hub/status";
const STREAM_PATH = "/api/hub/stream";
const PING_PATH = "/api/hub/ping";
const ROW_ACTION = /^\/api\/hub\/rows\/([^/]+)\/(start|stop)$/;

/** An "on" row shows the watcher's live status in place of the probe's.
 * @param {HubRowStatus} row @param {WatchEntry | null} entry @returns {HubViewRow} */
function withEntry(row, entry) {
  if (row.state !== "on" || !entry) return row;
  return entry.kind === "stream"
    ? { ...row, status: entry.status }
    : { ...row, watch: "no-stream" };
}

/**
 * The hub's one source of rows: the watcher's row source is load + aggregate, kept as the latest
 * view; an "on" row carries the watcher's live status. Listeners hear every refresh and every
 * watcher change (the stream drops the ones that change nothing).
 * @param {{
 *   load: () => { rows: HubRow[], errors: HubError[] },
 *   aggregate: (rows: HubRow[]) => Promise<{ rows: HubRowStatus[], at: string }>,
 *   intervalMs?: number,
 *   noStreamRetryTicks?: number,
 * }} options
 * @returns {HubFeed} */
export function makeHubFeed({ load, aggregate, intervalMs, noStreamRetryTicks }) {
  /** @type {{ rows: HubRowStatus[], errors: HubError[], at: string } | null} */
  let latest = null;
  /** @type {unknown} */
  let failure = null;
  /** @type {Set<() => void>} */
  const listeners = new Set();
  const notify = () => {
    for (const l of [...listeners]) l();
  };
  const rows = async () => {
    try {
      const { rows: loaded, errors } = load();
      const { rows: withStates, at } = await aggregate(loaded);
      latest = { rows: withStates, errors, at };
      failure = null;
      notify();
      return withStates;
    } catch (err) {
      failure = err;
      throw err;
    }
  };
  const watcher = makeWatcher({
    rows,
    ...(intervalMs !== undefined ? { intervalMs } : {}),
    ...(noStreamRetryTicks !== undefined ? { noStreamRetryTicks } : {}),
  });
  const offWatcher = watcher.onChange(notify);
  let stopped = false;
  /** @type {() => void} */
  let markStopped = () => {};
  /** @type {Promise<false>} */
  const stopping = new Promise((resolve) => {
    markStopped = () => {
      resolve(false);
    };
  });
  return {
    start: watcher.start,
    refresh: watcher.refresh,
    // false once stop ran, also for a wait already in progress (a first read may never finish).
    ready: () => {
      if (stopped) return Promise.resolve(false);
      if (latest) return Promise.resolve(true);
      return Promise.race([watcher.refresh().then(() => !stopped), stopping]);
    },
    view: () => {
      if (!latest) {
        throw failure instanceof Error ? failure : new Error("hub rows not read yet");
      }
      return { ...latest, rows: latest.rows.map((r) => withEntry(r, watcher.get(r))) };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    stop: () => {
      stopped = true;
      markStopped();
      watcher.stop();
      offWatcher();
      listeners.clear();
    },
  };
}

/** Every `at` (the view's and each status's) is a timestamp, never a change.
 * @param {unknown} view @returns {string} */
export function hubChangeKey(view) {
  return JSON.stringify(view, (key, /** @type {unknown} */ value) =>
    key === "at" ? undefined : value,
  );
}

/** The hub rows as server-sent events, through the repo's one SSE helper.
 * @param {HubFeed} feed @returns {HubStream} */
export function makeHubStream(feed) {
  return makeStatusStream({
    payload: feed.view,
    subscribe: feed.subscribe,
    changeKey: hubChangeKey,
  });
}

/** Stop the watcher, end every open stream response, then wait for the server to close.
 * @param {{ server: import("node:http").Server, feed: HubFeed, stream: HubStream }} parts
 * @returns {Promise<void>} */
export function closeHub({ server, feed, stream }) {
  feed.stop();
  stream.closeAll();
  return new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

/** @param {Res} res @param {number} code @param {unknown} body @param {Record<string, string>} [extra] */
function sendJson(res, code, body, extra = {}) {
  res.writeHead(code, { "content-type": "application/json", ...extra });
  res.end(JSON.stringify(body));
}

/** The hub's one Host/Origin rule, for every GET and for start/stop.
 * @param {Req} req @param {string} ownHost @returns {string | null} the refusal, or null */
function guardError(req, ownHost) {
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `http://${ownHost}`) return "forbidden origin";
  if (req.headers.host !== ownHost) return "forbidden host";
  return null;
}

/** @param {HubDeps} deps @param {Req} req @param {Res} res @param {string} pathname */
async function sendAction(deps, req, res, pathname) {
  const match = ROW_ACTION.exec(pathname);
  if (!match) {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  const refusal = guardError(req, deps.ownHost);
  if (refusal) {
    sendJson(res, 403, { error: refusal });
    return;
  }
  const id = decodeURIComponent(match[1] ?? "");
  const { rows } = deps.load();
  const row = rows.find((r) => r.id === id);
  if (!row) {
    sendJson(res, 404, { error: "unknown row" });
    return;
  }
  const result =
    match[2] === "start"
      ? await deps.lifecycle.start(row, rows)
      : await deps.lifecycle.stop(row, rows);
  sendJson(res, result.code, result);
}

/** Every GET passes the guard first. @param {HubDeps} deps @param {Req} req @param {Res} res @param {string} pathname */
async function sendGet(deps, req, res, pathname) {
  const refusal = guardError(req, deps.ownHost);
  if (refusal) {
    sendJson(res, 403, { error: refusal });
    return;
  }
  if (pathname === PING_PATH) {
    sendJson(res, 200, { hub: true, pid: process.pid });
    return;
  }
  if (pathname !== STATUS_PATH && pathname !== STREAM_PATH) {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  if (!(await deps.feed.ready())) {
    sendJson(res, 503, { error: "hub is shutting down" });
    return;
  }
  const view = deps.feed.view(); // throws (500) before any stream header when no rows were read
  if (pathname === STATUS_PATH) sendJson(res, 200, view);
  else deps.stream.handle(req, res);
}

/** @param {HubDeps} deps @param {Req} req @param {Res} res */
async function route(deps, req, res) {
  // Match the pathname only, so a cache-busting `?t=…` still reaches the route.
  const pathname = (req.url ?? "").split("?")[0] ?? "";
  if (req.method === "GET") {
    await sendGet(deps, req, res, pathname);
    return;
  }
  if (req.method === "POST") {
    await sendAction(deps, req, res, pathname);
    return;
  }
  sendJson(res, 405, { error: "method not allowed" }, { allow: "GET, POST" });
}

/** @param {HubDeps} deps @returns {(req: Req, res: Res) => void} */
export function makeHubHandler(deps) {
  return (req, res) => {
    route(deps, req, res).catch((/** @type {unknown} */ err) => {
      const message = err instanceof Error ? err.message : String(err);
      if (res.headersSent) {
        res.end();
        return;
      }
      sendJson(res, 500, { error: message });
    });
  };
}

/**
 * Listen on host:port; resolves on `listening`, rejects on the first `error` (EADDRINUSE included).
 * @param {{ handler: (req: Req, res: Res) => void, host?: string, port: number }} options
 * @returns {Promise<{ server: import("node:http").Server, address: string }>} */
export function startHubServer({ handler, host = "127.0.0.1", port }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.once("error", reject);
    server.once("listening", () => {
      server.off("error", reject);
      const addr = /** @type {import("node:net").AddressInfo} */ (server.address());
      resolve({ server, address: `http://${host}:${addr.port}` });
    });
    server.listen(port, host);
  });
}
