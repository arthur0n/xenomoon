// token-history.js runs at import, so every test spawns it as a subprocess against a temp project.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";

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

/** True when the install's own .xenomoon.json saves a projectDir (then "no project" cannot be
 * produced without touching it, so those tests skip rather than read a real project). */
function installHasProjectDir() {
  const file = path.join(ROOT, ".xenomoon.json");
  if (!existsSync(file)) return false;
  try {
    const data = /** @type {{ projectDir?: unknown }} */ (parseJSON(readFileSync(file, "utf8")));
    return Boolean(data.projectDir);
  } catch {
    return false;
  }
}

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

test("snapshot without any project is refused naming --project", (t) => {
  if (installHasProjectDir()) {
    t.skip("install .xenomoon.json saves a projectDir");
    return;
  }
  const r = run(["snapshot", "--global"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--project/);
  assert.equal(r.stdout, "");
});

test("pending --json needs no project", (t) => {
  if (installHasProjectDir()) {
    t.skip("install .xenomoon.json saves a projectDir");
    return;
  }
  const r = run(["pending", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Array.isArray(/** @type {unknown} */ (parseJSON(r.stdout))));
});

test("snapshot --global --project with no value is refused, no dir named true", () => {
  const r = run(["snapshot", "--global", "--project"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--project needs a directory/);
  assert.equal(r.stdout, "");
});
