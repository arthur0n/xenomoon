// The hub page (#94): GET answers a file from the built dist/ folder. "/" is index.html; every other
// path is looked up inside dist/ only. A dot segment (".", "..", the build record, any dot-file), NUL,
// a bad escape, a directory, a missing file or a symlink out of dist/ is a 404; no index.html fallback.
import fs from "node:fs/promises";
import path from "node:path";

/** @type {Record<string, string>} */
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/** The path segments under dist/ for a request pathname, or null when it may not be served.
 * @param {string} pathname @returns {string[] | null} */
export function pageSegments(pathname) {
  /** @type {string} */
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const segments = decoded.split("/").filter((s) => s !== "");
  if (segments.length === 0) return ["index.html"];
  return segments.some((s) => s.startsWith(".")) ? null : segments;
}

/** The real path of the file to send, or null when it is missing, not a file, or outside dist/.
 * @param {string} distDir @param {string[]} segments @returns {Promise<string | null>} */
async function resolveInside(distDir, segments) {
  try {
    const realDist = await fs.realpath(distDir);
    const real = await fs.realpath(path.join(realDist, ...segments));
    if (!real.startsWith(realDist + path.sep)) return null;
    return (await fs.stat(real)).isFile() ? real : null;
  } catch {
    return null;
  }
}

/** @param {import("node:http").ServerResponse} res */
function notFound(res) {
  res.writeHead(404, { "content-type": "text/plain", "x-content-type-options": "nosniff" });
  res.end("not found");
}

/** Answer one GET for the hub page from `distDir`; the caller has already run the Host/Origin guard.
 * @param {import("node:http").ServerResponse} res @param {string} distDir @param {string} pathname
 * @returns {Promise<void>} */
export async function sendPageFile(res, distDir, pathname) {
  const segments = pageSegments(pathname);
  const file = segments ? await resolveInside(distDir, segments) : null;
  if (!file) {
    notFound(res);
    return;
  }
  const body = await fs.readFile(file);
  /** @type {Record<string, string>} */
  const headers = {
    "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "x-content-type-options": "nosniff",
  };
  if (segments?.join("/") === "index.html") headers["cache-control"] = "no-cache";
  res.writeHead(200, headers);
  res.end(body);
}
