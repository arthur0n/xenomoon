// The hub page (#94) over a real port-0 hub with a temporary dist/ folder: "/" and assets with their
// headers, the Host/Origin guard, every way out of dist/ refused as 404, the /api/ routes untouched,
// and runHub's build-then-listen step with a fake build (no Vite runs here).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { makeHubFeed, makeHubHandler, makeHubStream, startHubServer } from "./server.js";
import { RECORD_NAME } from "./build.js";
import { pageSegments } from "./page.js";
import { runHub } from "../../cli/hub.js";
import { withDeadline } from "../../core/http/test-deadline.js";

const ROOT = fs.mkdtempSync(path.join(tmpdir(), "hub-page-"));
const DIST = path.join(ROOT, "dist");
const SECRET = path.join(ROOT, "secret.txt");
const INDEX = "<!doctype html><title>hub</title>";
const FILES = /** @type {const} */ ([
  ["assets/app.js", "text/javascript; charset=utf-8"],
  ["assets/app.css", "text/css; charset=utf-8"],
  ["mark.svg", "image/svg+xml"],
  ["data.json", "application/json"],
  ["mark.png", "image/png"],
  ["mark.webp", "image/webp"],
  ["favicon.ico", "image/x-icon"],
  ["assets/font.woff2", "font/woff2"],
]);
const empty = () => ({ rows: [], errors: [] });
const feed = makeHubFeed({ load: empty, aggregate: async () => ({ rows: [], at: "x" }) });
const lifecycle = {
  start: async () => ({ ok: true, code: 200 }),
  stop: async () => ({ ok: true, code: 200 }),
};
const deps = {
  load: empty,
  feed,
  stream: makeHubStream(feed),
  lifecycle,
  ownHost: "",
  distDir: DIST,
};
/** @type {import("node:http").Server} */
let server;
let port = 0;

before(async () => {
  fs.mkdirSync(path.join(DIST, "assets"), { recursive: true });
  fs.writeFileSync(path.join(DIST, "index.html"), INDEX);
  for (const [rel] of FILES) fs.writeFileSync(path.join(DIST, rel), `file ${rel}`);
  fs.writeFileSync(path.join(DIST, RECORD_NAME), '{"inputs":{}}');
  fs.writeFileSync(path.join(DIST, "assets", ".hidden"), "hidden");
  fs.writeFileSync(SECRET, "SECRET");
  fs.symlinkSync(SECRET, path.join(DIST, "link.txt"));
  const started = await startHubServer({
    handler: makeHubHandler(/** @type {any} */ (deps)),
    port: 0,
  });
  server = started.server;
  deps.ownHost = started.address.slice("http://".length);
  port = Number(deps.ownHost.split(":")[1]);
});
after(async () => {
  feed.stop();
  await new Promise((r) => server.close(r));
  fs.rmSync(ROOT, { recursive: true, force: true });
});

/** One raw request (the path is sent as written, no normalising), with its headers.
 * @param {string} reqPath @param {{ method?: string, headers?: Record<string, string>, to?: number }} [o]
 * @returns {Promise<{ status: number | undefined, headers: import("node:http").IncomingHttpHeaders, text: string }>} */
function get(reqPath, { method = "GET", headers = { host: deps.ownHost }, to = port } = {}) {
  /** @type {import("node:http").ClientRequest | undefined} */
  let req;
  return withDeadline(
    `${method} ${reqPath}`,
    (resolve, reject) => {
      req = http.request(
        { host: "127.0.0.1", port: to, path: reqPath, method, headers, agent: false },
        (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (/** @type {string} */ c) => {
            text += c;
          });
          res.on("end", () => {
            resolve({ status: res.statusCode, headers: res.headers, text });
          });
        },
      );
      req.on("error", reject);
      req.end();
    },
    () => req?.destroy(),
  );
}

test("/ answers index.html as no-cache html with nosniff", async () => {
  const r = await get("/");
  assert.equal(r.status, 200);
  assert.equal(r.text, INDEX);
  assert.equal(r.headers["content-type"], "text/html; charset=utf-8");
  assert.equal(r.headers["cache-control"], "no-cache");
  assert.equal(r.headers["x-content-type-options"], "nosniff");
});

test("each asset type answers its content type with nosniff and no no-cache", async () => {
  for (const [rel, type] of FILES) {
    const r = await get(`/${rel}?v=1`);
    assert.deepEqual(
      [r.status, r.headers["content-type"], r.text],
      [200, type, `file ${rel}`],
      rel,
    );
    assert.equal(r.headers["x-content-type-options"], "nosniff", rel);
    assert.equal(r.headers["cache-control"], undefined, rel);
  }
});

test("/, an asset and a 404 refuse to be framed (X-Frame-Options and frame-ancestors)", async () => {
  // A cross-site iframe navigation sends no Origin, so the guard serves it; only these headers stop it.
  const framed = { host: deps.ownHost, "sec-fetch-dest": "iframe", "sec-fetch-site": "cross-site" };
  for (const p of ["/", "/assets/app.js", "/nope.js"]) {
    const r = await get(p, { headers: framed });
    assert.equal(r.status, p === "/nope.js" ? 404 : 200, p);
    assert.equal(r.headers["x-frame-options"], "DENY", p);
    assert.equal(r.headers["content-security-policy"], "frame-ancestors 'none'", p);
  }
});

test("a page GET with a foreign Host or Origin is a 403 before any file is read", async () => {
  const host = await get("/", { headers: { host: "evil.test:80" } });
  const origin = await get("/", {
    headers: { host: deps.ownHost, origin: "http://127.0.0.1:65000" },
  });
  assert.deepEqual([host.status, origin.status], [403, 403]);
  assert.ok(!host.text.includes("hub</title>") && !origin.text.includes("hub</title>"));
});

test("no path resolves outside dist/: .., encoded .., encoded slash, absolute, NUL", async () => {
  const paths = [
    "/../secret.txt",
    "/%2e%2e/secret.txt",
    "/assets/%2e%2e%2f%2e%2e%2fsecret.txt",
    "/assets/..%2f..%2fsecret.txt",
    `/${encodeURIComponent(SECRET)}`,
    `//${SECRET.slice(1)}`,
    "/index.html%00",
    "/%E0%A4%A",
  ];
  for (const p of paths) {
    const r = await get(p);
    assert.equal(r.status, 404, p);
    assert.ok(!r.text.includes("SECRET"), p);
  }
});

test("NUL and backslash are refused before the file system is asked", () => {
  assert.deepEqual([pageSegments("/index.html%00"), pageSegments("/a%5Cb.js")], [null, null]);
});

test("a symlink inside dist/ pointing out of it is a 404", async () => {
  const r = await get("/link.txt");
  assert.deepEqual([r.status, r.text.includes("SECRET")], [404, false]);
});

test("the build record and any other dot-file are a 404", async () => {
  for (const p of [`/${RECORD_NAME}`, "/assets/.hidden", `/assets/../${RECORD_NAME}`]) {
    const r = await get(p);
    assert.equal(r.status, 404, p);
    assert.ok(!r.text.includes("inputs") && !r.text.includes("hidden"), p);
  }
});

test("a missing file and a directory are a 404, never index.html", async () => {
  for (const p of ["/nope.js", "/deep/route", "/assets", "/assets/"]) {
    const r = await get(p);
    assert.equal(r.status, 404, p);
    assert.notEqual(r.text, INDEX, p);
  }
});

test("/api/ paths keep their JSON answers and non-GET/POST keeps its 405", async () => {
  const ping = await get("/api/hub/ping");
  const unknown = await get("/api/index.html");
  const put = await get("/", { method: "PUT" });
  /** @type {unknown} */
  const pingJson = JSON.parse(ping.text);
  const pingBody = /** @type {{ hub?: unknown }} */ (pingJson);
  assert.deepEqual([ping.status, pingBody.hub], [200, true]);
  assert.deepEqual([unknown.status, JSON.parse(unknown.text)], [404, { error: "not found" }]);
  assert.deepEqual([put.status, put.headers.allow], [405, "GET, POST"]);
});

function recorder() {
  return {
    /** @type {string[]} */ lines: [],
    /** @type {string[]} */ errs: [],
    /** @type {number[]} */ codes: [],
    builds: 0,
  };
}

test("a failed build prints its output to stderr, exits 1 and never listens", async () => {
  const rec = recorder();
  const started = await runHub({
    port: 0,
    load: empty,
    log: (l) => rec.lines.push(l),
    errLog: (l) => rec.errs.push(l),
    exit: (c) => rec.codes.push(c),
    ensureBuilt: async () => {
      throw new Error("hub build failed\nVITE SAYS NO");
    },
  });
  started?.server.close();
  assert.equal(started, null);
  assert.deepEqual(rec.codes, [1]);
  assert.match(rec.errs.join("\n"), /VITE SAYS NO/);
  assert.ok(!rec.lines.some((l) => l.includes("listening")));
});

test("a second hub on a running hub's port exits 0 without building", async () => {
  const rec = recorder();
  const started = await runHub({
    port,
    load: empty,
    log: (l) => rec.lines.push(l),
    exit: (c) => rec.codes.push(c),
    ensureBuilt: async () => {
      rec.builds += 1;
    },
  });
  started?.server.close();
  assert.deepEqual([started, rec.codes, rec.builds], [null, [0], 0]);
});

test("a hub builds once, then listens and serves the page from its dist folder", async () => {
  const rec = recorder();
  const started = await runHub({
    port: 0,
    load: empty,
    distDir: DIST,
    log: (l) => rec.lines.push(l),
    exit: (c) => rec.codes.push(c),
    ensureBuilt: async () => {
      rec.builds += 1;
    },
  });
  assert.ok(started);
  const own = started.address.slice("http://".length);
  const r = await get("/", { headers: { host: own }, to: Number(own.split(":")[1]) });
  await new Promise((res) => started.server.close(res));
  assert.deepEqual([rec.builds, rec.codes, r.status, r.text], [1, [], 200, INDEX]);
});
