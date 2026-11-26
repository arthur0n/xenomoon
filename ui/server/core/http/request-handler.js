// The HTTP request dispatcher (#60), moved out of index.js so a test can drive it on a port-0
// server: index.js listens at import, so nothing inside it is importable. Route tables and
// handlers come in as deps; this file owns only the dispatch order.
import { corsOrigin, isLocalHost, requestRefusal } from "./cors.js";
import { redactFor } from "./status-redact.js";

/** @typedef {import("node:http").IncomingMessage} Req */
/** @typedef {import("node:http").ServerResponse} Res */
/** @typedef {{
 *   getRoutes: Record<string, () => unknown>,
 *   postRoutes: Record<string, (req: Req, res: Res) => void>,
 *   deleteSession: (id: string) => boolean,
 *   handleAgentApi: (req: Req, res: Res, url: string) => void,
 *   serveStatic: (req: Req, res: Res) => void,
 *   status: {
 *     path: string,
 *     payload: () => unknown,
 *     streamPath: string,
 *     stream: (req: Req, res: Res) => void,
 *   },
 * }} RequestDeps */

/** The status answer: JSON, plus CORS only for a local install's Origin (the only CORS route).
 * @param {Req} req @param {Res} res @param {unknown} payload */
function sendStatus(req, res, payload) {
  /** @type {Record<string, string>} */
  const headers = { "content-type": "application/json" };
  const origin = corsOrigin(req.headers.origin);
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }
  res.writeHead(200, headers);
  res.end(JSON.stringify(redactFor(req.headers, payload)));
}

/** The status stream path: GET opens the stream, any other method is refused with 405.
 * @param {Req} req @param {Res} res @param {RequestDeps["status"]} status */
function routeStream(req, res, status) {
  if (req.method === "GET") {
    status.stream(req, res);
    return;
  }
  res.writeHead(405, { "content-type": "application/json", allow: "GET" });
  res.end(JSON.stringify({ error: "method not allowed" }));
}

/** The two status routes. The Host check comes first (also before the stream's 405), so a
 * foreign name (DNS rebinding, #92) gets 403 and no payload is built. True when handled.
 * @param {Req} req @param {Res} res @param {RequestDeps["status"]} status
 * @param {string} pathname @returns {boolean} */
function routeStatus(req, res, status, pathname) {
  if (pathname !== status.path && pathname !== status.streamPath) return false;
  if (!isLocalHost(req.headers.host)) {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "forbidden host" }));
  } else if (pathname === status.path) sendStatus(req, res, status.payload());
  else routeStream(req, res, status);
  return true;
}

/** Every non-status request: a foreign Host or Origin (#89) gets 403 before any handler or
 * static file runs. True when refused.
 * @param {Req} req @param {Res} res @returns {boolean} */
function refuseForeign(req, res) {
  const refusal = requestRefusal(req.headers);
  if (refusal === null) return false;
  res.writeHead(403, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: refusal }));
  return true;
}

/** @param {RequestDeps} deps @returns {(req: Req, res: Res) => void} */
export function makeRequestHandler(deps) {
  return (req, res) => {
    const url = req.url ?? "";
    // GET lookups match the pathname, so a cache-busting `?t=…` still reaches the route.
    const pathname = url.split("?")[0] ?? "";
    if (routeStatus(req, res, deps.status, pathname)) return;
    if (refuseForeign(req, res)) return;
    const getRoute = deps.getRoutes[pathname];
    if (getRoute && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(getRoute()));
      return;
    }
    if (req.method === "DELETE" && url.startsWith("/api/sessions/")) {
      const id = decodeURIComponent(url.slice("/api/sessions/".length));
      const ok = deps.deleteSession(id);
      res.writeHead(ok ? 200 : 404, { "content-type": "application/json" });
      res.end(JSON.stringify({ deleted: ok }));
      return;
    }
    if (req.method === "POST" && url.startsWith("/api/agents/")) {
      deps.handleAgentApi(req, res, url);
      return;
    }
    const postRoute = deps.postRoutes[url];
    if (req.method === "POST" && postRoute) {
      postRoute(req, res);
      return;
    }
    deps.serveStatic(req, res);
  };
}
