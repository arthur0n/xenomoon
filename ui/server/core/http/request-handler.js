// The HTTP request dispatcher (#60), moved out of index.js so a test can drive it on a port-0
// server: index.js listens at import, so nothing inside it is importable. Route tables and
// handlers come in as deps; this file owns only the dispatch order.
import { corsOrigin } from "./cors.js";

/** @typedef {import("node:http").IncomingMessage} Req */
/** @typedef {import("node:http").ServerResponse} Res */
/** @typedef {{
 *   getRoutes: Record<string, () => unknown>,
 *   postRoutes: Record<string, (req: Req, res: Res) => void>,
 *   deleteSession: (id: string) => boolean,
 *   handleAgentApi: (req: Req, res: Res, url: string) => void,
 *   serveStatic: (req: Req, res: Res) => void,
 *   status: { path: string, payload: () => unknown },
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
  res.end(JSON.stringify(req.headers.origin ? withoutLastLine(payload) : payload));
}

/** Any request carrying an Origin (allowed or not) gets the payload minus `lastLine`: the trusted
 * hub origin becomes config in #63; until then no cross-origin page reads conversation text.
 * @param {unknown} payload @returns {unknown} */
function withoutLastLine(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const { lastLine: _drop, ...rest } = /** @type {Record<string, unknown>} */ (payload);
  return rest;
}

/** @param {RequestDeps} deps @returns {(req: Req, res: Res) => void} */
export function makeRequestHandler(deps) {
  return (req, res) => {
    const url = req.url ?? "";
    // GET lookups match the pathname, so a cache-busting `?t=…` still reaches the route.
    const pathname = url.split("?")[0] ?? "";
    if (pathname === deps.status.path) {
      sendStatus(req, res, deps.status.payload());
      return;
    }
    const getRoute = deps.getRoutes[pathname];
    if (getRoute) {
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
