// A server that outlives its install holds the port and serves a deleted tree. These pin the
// two rules that matter: name every such process, and never name a healthy one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCwdLines, orphans, report, isFrameworkServer, parsePs } from "./orphan-servers.js";

const LIVE = "/ws/live-xm";
const GONE = "/ws/deleted-xm";
const RENAMED = "/ws/renamed-xm";
/** @param {string} d */
const exists = (d) => d !== GONE;
/** @param {string} d */
const isInstall = (d) => d === LIVE;

test("only OUR server is a server — this report ends in a kill command", () => {
  assert.ok(isFrameworkServer("node ui/server/core/index.js"));
  assert.ok(isFrameworkServer("node /ws/app-xm/ui/server/core/index.js --port 3118"));
  // Everything below is someone else's node process. A loose match would hand the human a
  // `kill` line that takes down their editor tooling.
  assert.equal(isFrameworkServer("node /usr/lib/typescript-language-server.js"), false);
  assert.equal(isFrameworkServer("node esbuild --serve"), false);
  assert.equal(isFrameworkServer("node ui/server/core/index.js.bak"), false);
  assert.equal(isFrameworkServer("node evil-ui/server/core/index.js"), false);
  // argv[0] must be node. A wrapper or a search that merely MENTIONS the path is not a
  // server, and the sh -c case showed up the first time this ran against a real machine.
  assert.equal(isFrameworkServer("grep ui/server/core/index.js"), false);
  assert.equal(isFrameworkServer("sh -c cd /x && node ui/server/core/index.js"), false);
  assert.equal(isFrameworkServer("/opt/homebrew/bin/node /x/ui/server/core/index.js"), true);
});

test("ps output parses to pid + command line", () => {
  assert.deepEqual(parsePs("  101 node a.js\n 2002 node /x/y/index.js --flag\nbad line\n"), [
    { pid: 101, args: "node a.js" },
    { pid: 2002, args: "node /x/y/index.js --flag" },
  ]);
});

test("lsof field output pairs each pid with its cwd", () => {
  assert.deepEqual(parseCwdLines("p101\nn/a/b\np202\nn/c/d\n"), [
    { pid: 101, cwd: "/a/b" },
    { pid: 202, cwd: "/c/d" },
  ]);
});

test("a path containing spaces survives parsing", () => {
  // The human-readable table splits on whitespace and would lose this.
  assert.deepEqual(parseCwdLines("p7\nn/Users/me/My Projects/app-xm\n"), [
    { pid: 7, cwd: "/Users/me/My Projects/app-xm" },
  ]);
});

test("truncated output yields no half-built record", () => {
  assert.deepEqual(parseCwdLines("p101\n"), []);
  assert.deepEqual(parseCwdLines(""), []);
});

test("a deleted install's server is an orphan", () => {
  const found = orphans([{ pid: 1, cwd: GONE }], isInstall, exists);
  assert.deepEqual(
    found.map((f) => f.pid),
    [1],
  );
});

test("a directory that still exists but is no longer an install is an orphan", () => {
  const found = orphans([{ pid: 2, cwd: RENAMED }], isInstall, exists);
  assert.deepEqual(
    found.map((f) => f.pid),
    [2],
  );
});

test("a healthy install's server is never named", () => {
  assert.deepEqual(orphans([{ pid: 3, cwd: LIVE }], isInstall, exists), []);
});

test("mixed processes: only the dead ones are reported", () => {
  const found = orphans(
    [
      { pid: 1, cwd: LIVE },
      { pid: 2, cwd: GONE },
      { pid: 3, cwd: RENAMED },
    ],
    isInstall,
    exists,
  );
  assert.deepEqual(
    found.map((f) => f.pid),
    [2, 3],
  );
});

test("nothing found prints nothing at all", () => {
  assert.deepEqual(report([]), []);
});

test("the report names each pid, its former path, and one command to clear them", () => {
  const text = report([
    { pid: 11, cwd: GONE },
    { pid: 12, cwd: RENAMED },
  ]).join("\n");
  assert.match(text, /pid 11 — was \/ws\/deleted-xm/);
  assert.match(text, /kill 11 12/);
  // stop_server cannot reach an orphan; offering it would send someone in a circle.
  assert.match(text, /`stop_server` cannot reach them/);
});
