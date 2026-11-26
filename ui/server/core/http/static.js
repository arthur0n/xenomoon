// Static file serving for the UI. Files are re-read per request — edit and
// refresh, no restart, no build. Serves anything under ui/ (index.html,
// agent-ui.css, and the client/ + lib/ ES modules) with the right MIME type,
// guarding against path traversal. Every answer (200, 403, 404) refuses framing,
// so a foreign page cannot show the project page in an iframe (#89).
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { UI_DIR } from "../config.js";

/** @type {Record<string, string>} */
const TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".md": "text/markdown",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const BASE = path.resolve(UI_DIR);

/** Sent on every answer: a browser shows no project page inside any frame (old header + CSP one). */
const NO_FRAME = {
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
};

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res */
export function serveStatic(req, res) {
  const url = (req.url ?? "/").split("?")[0] ?? "/";
  const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
  const filePath = path.resolve(BASE, rel);
  if (filePath !== BASE && !filePath.startsWith(BASE + path.sep)) {
    res.writeHead(403, NO_FRAME);
    res.end("forbidden");
    return;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, NO_FRAME);
    res.end("not found");
    return;
  }
  const type = TYPES[path.extname(filePath)] ?? "application/octet-stream";
  // no-cache = revalidate every load (cheap on localhost). Without it the browser
  // heuristically caches the ES modules, and after a sync a plain refresh can mix
  // stale and fresh modules — init half-dies in "cosmetic" ways (missing rail
  // sections, dead filter chips) that look like code regressions.
  res.writeHead(200, { ...NO_FRAME, "content-type": type, "cache-control": "no-cache" });
  res.end(readFileSync(filePath));
}
