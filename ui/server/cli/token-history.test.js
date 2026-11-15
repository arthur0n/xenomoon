// pickProject is tested as a pure function on injected inputs; the CLI tests spawn the script
// against a temp project with --project, so none depends on this checkout's .xenomoon.json.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";
import { pickProject } from "./token-history.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = path.join(ROOT, "ui/server/cli/token-history.js");
const tmp = mkdtempSync(path.join(tmpdir(), "token-history-"));
after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** Parse CLI stdout as a flat record of numbers (the metrics JSON shape).
 * @param {string} text @returns {Record<string, number>} */
const metrics = (text) => /** @type {Record<string, number>} */ (parseJSON(text));

/** @param {string[]} args */
const run = (args) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: "utf8" });

test("snapshot --global --project reads <project>/.xenomoon/logs", () => {
  const project = path.join(tmp, "with-logs");
  mkdirSync(path.join(project, ".xenomoon", "logs"), { recursive: true });
  const line = { message: { type: "result", total_cost_usd: 0.5, usage: { input_tokens: 10 } } };
  writeFileSync(
    path.join(project, ".xenomoon", "logs", "session-x.ndjson"),
    JSON.stringify(line) + "\n",
  );
  const r = run(["snapshot", "--global", "--project", project]);
  assert.equal(r.status, 0, r.stderr);
  const snap = metrics(r.stdout);
  assert.equal(snap.sessionCount, 1);
  assert.equal(snap.total, 10);
  assert.equal(snap.cost, 0.5);
});

test("snapshot --sessions --project measures the tagged session in the project", () => {
  const project = path.join(tmp, "tagged");
  mkdirSync(path.join(project, ".xenomoon", "logs"), { recursive: true });
  const line = { message: { type: "result", usage: { output_tokens: 7 } } };
  writeFileSync(
    path.join(project, ".xenomoon", "logs", "session-y.ndjson"),
    JSON.stringify(line) + "\n",
  );
  const r = run(["snapshot", "--sessions", "y", "--project", project]);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /missing session log/);
  const m = metrics(r.stdout);
  assert.equal(m.output, 7);
  assert.equal(m.turns, 1);
});

test("snapshot --global on a project without a log dir is zero sessions, exit 0", () => {
  const project = path.join(tmp, "empty");
  mkdirSync(project, { recursive: true });
  const r = run(["snapshot", "--global", "--project", project]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(metrics(r.stdout).sessionCount, 0);
});

test("pending --json needs no project", () => {
  const r = run(["pending", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Array.isArray(/** @type {unknown} */ (parseJSON(r.stdout))));
});

test("snapshot --global --project with no value is refused, no dir named true", () => {
  const r = run(["snapshot", "--global", "--project"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--project needs a project name or a directory/);
  assert.equal(r.stdout, "");
});

const ALPHA = { name: "alpha", dir: "/srv/alpha-app" };
const BETA = { name: "beta", dir: "/srv/beta-app" };

test("pickProject: a --project value naming a map entry resolves to that entry's dir", () => {
  assert.deepEqual(pickProject({ flag: "beta", projects: [ALPHA, BETA] }), {
    ok: true,
    dir: BETA.dir,
  });
});

test("pickProject: a --project value that names no entry is a directory path", () => {
  assert.deepEqual(pickProject({ flag: "/srv/other", projects: [ALPHA, BETA], rootDir: "/x" }), {
    ok: true,
    dir: "/srv/other",
  });
});

test("pickProject: no flag and exactly one project picks it over a root projectDir", () => {
  assert.deepEqual(pickProject({ projects: [ALPHA], rootDir: "/srv/legacy" }), {
    ok: true,
    dir: ALPHA.dir,
  });
});

test("pickProject: no flag and several projects is refused, listing names and --project <name>", () => {
  const r = pickProject({ projects: [ALPHA, BETA], rootDir: "/srv/legacy" });
  assert.equal(r.ok, false);
  const message = r.ok ? "" : r.message;
  assert.match(message, /alpha, beta/);
  assert.match(message, /pass --project <name>/);
});

test("pickProject: no flag and an empty map falls back to the legacy root projectDir", () => {
  assert.deepEqual(pickProject({ projects: [], rootDir: "/srv/legacy" }), {
    ok: true,
    dir: "/srv/legacy",
  });
});

test("pickProject: no project at all is refused naming --project and install-project", () => {
  const r = pickProject({ projects: [], rootDir: null });
  assert.equal(r.ok, false);
  const message = r.ok ? "" : r.message;
  assert.match(message, /pass --project <name\|dir>/);
  assert.match(message, /npm run install-project -- <dir>/);
  assert.doesNotMatch(message, /projectDir/);
});

test("#65: run through a symlink, the script still runs as the CLI (unknown command, exit 1)", () => {
  const link = path.join(tmp, "token-history-link.js");
  symlinkSync(SCRIPT, link);
  const r = spawnSync(process.execPath, [link, "no-such-command"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /unknown command "no-such-command"/);
});
