// The hub's own JSON-only HTTP surface: GET /api/hub/status, GET /api/hub/ping (a constant
// "I am a hub" answer that does no work, for the second hub's probe), POST /api/hub/rows/<id>/start|stop.
// Start and stop are refused unless Host is the hub's own and Origin is absent or the hub's own,
// so a page on another local port cannot drive a client. Ids resolve only through load().rows.
import http from "node:http";

/** @typedef {import("./rows.js").HubRow} HubRow */
/** @typedef {import("./rows.js").HubError} HubError */
/** @typedef {import("./lifecycle.js").OpResult} OpResult */
/** @typedef {import("node:http").IncomingMessage} Req */
/** @typedef {import("node:http").ServerResponse} Res */

/**
 * @typedef {{
 *   load: () => { rows: HubRow[], errors: HubError[] },
 *   aggregate: (rows: HubRow[]) => Promise<{ rows: unknown[], at: string }>,
 *   lifecycle: {
 *     start: (row: HubRow, rows: HubRow[]) => Promise<OpResult>,
 *     stop: (row: HubRow, rows: HubRow[]) => Promise<OpResult>,
 *   },
 *   ownHost: string,
 * }} HubDeps
 */

const STATUS_PATH = "/api/hub/status";
const PING_PATH = "/api/hub/ping";
const ROW_ACTION = /^\/api\/hub\/rows\/([^/]+)\/(start|stop)$/;

/** @param {Res} res @param {number} code @param {unknown} body @param {Record<string, string>} [extra] */
function sendJson(res, code, body, extra = {}) {
  res.writeHead(code, { "content-type": "application/json", ...extra });
  res.end(JSON.stringify(body));
}

/** @param {Req} req @param {string} ownHost @returns {string | null} the refusal, or null */
function guardError(req, ownHost) {
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `http://${ownHost}`) return "forbidden origin";
  if (req.headers.host !== ownHost) return "forbidden host";
  return null;
}

/** @param {HubDeps} deps @param {Res} res */
async function sendStatus(deps, res) {
  const { rows, errors } = deps.load();
  const { rows: withStates, at } = await deps.aggregate(rows);
  sendJson(res, 200, { rows: withStates, errors, at });
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

/** @param {HubDeps} deps @param {Req} req @param {Res} res */
async function route(deps, req, res) {
  // Match the pathname only, so a cache-busting `?t=…` still reaches the route.
  const pathname = (req.url ?? "").split("?")[0] ?? "";
  if (req.method === "GET") {
    if (pathname === STATUS_PATH) await sendStatus(deps, res);
    else if (pathname === PING_PATH) sendJson(res, 200, { hub: true, pid: process.pid });
    else sendJson(res, 404, { error: "not found" });
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
