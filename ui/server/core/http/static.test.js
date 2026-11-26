// serveStatic refuses framing on every answer (#89): X-Frame-Options and a CSP frame-ancestors
// directive ride on 200, 404 and 403, so a browser shows no project page inside a frame.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// config.js resolves PROJECT_DIR at import: point it at a throwaway project first.
const project = mkdtempSync(path.join(tmpdir(), "xm-static-"));
process.env.GAME_DIR = project;

const { serveStatic } = await import("./static.js");

/** @type {import("node:http").Server} */
const server = http.createServer(serveStatic);
/** @type {number} */
let port = 0;

before(async () => {
  await new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      resolve(undefined);
    }),
  );
  const addr = server.address();
  port = typeof addr === "object" && addr ? addr.port : 0;
});

after(async () => {
  await new Promise((resolve) =>
    server.close(() => {
      resolve(undefined);
    }),
  );
  rmSync(project, { recursive: true, force: true });
});

/**
 * GET the raw path (http.request sends it as given, no normalising).
 * @param {string} rawPath
 * @returns {Promise<import("node:http").IncomingMessage>}
 */
function get(rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: rawPath, method: "GET" }, (res) => {
      res.resume();
      res.on("end", () => {
        resolve(res);
      });
    });
    req.on("error", reject);
    req.end();
  });
}

/** @param {import("node:http").IncomingMessage} res */
function assertNoFrame(res) {
  assert.equal(res.headers["x-frame-options"], "DENY");
  assert.equal(res.headers["content-security-policy"], "frame-ancestors 'none'");
}

test("#89 the page (/) is 200 with both frame headers, its content type and no-cache", async () => {
  const res = await get("/");
  assert.equal(res.statusCode, 200);
  assertNoFrame(res);
  assert.equal(res.headers["content-type"], "text/html");
  assert.equal(res.headers["cache-control"], "no-cache");
});

test("#89 a missing file is 404 with both frame headers", async () => {
  const res = await get("/no-such-file.js");
  assert.equal(res.statusCode, 404);
  assertNoFrame(res);
});

test("#89 a path traversal is 403 with both frame headers", async () => {
  const res = await get("/../../../../etc/passwd");
  assert.equal(res.statusCode, 403);
  assertNoFrame(res);
});
