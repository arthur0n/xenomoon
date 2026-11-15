// #65: the old single-project writers refuse. `npm run bind-project-path <dir>` (setup.js) and
// `npm run start-project -- --add` (start-profile.js) exit 1 naming `npm run install-project`
// and write nothing. Both scripts resolve the install from their OWN location and write
// `<install>/.xenomoon.json`, so they run from a TEMP copy of ui/server/cli + ui/lib, never in
// place; the registry is a temp file too (XENOMOON_REGISTRY).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";

const SRC_UI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const INITIAL = {
  domain: "webapp",
  port: 3117,
  hermes: { enabled: true, model: "m" },
  projects: { app: { dir: "/tmp/app", port: 3117 } },
};

let ws = "";
let cfgFile = "";
let projectDir = "";

before(() => {
  ws = mkdtempSync(path.join(tmpdir(), "xm-single-writes-"));
  cpSync(path.join(SRC_UI, "server", "cli"), path.join(ws, "ui", "server", "cli"), {
    recursive: true,
  });
  cpSync(path.join(SRC_UI, "lib"), path.join(ws, "ui", "lib"), { recursive: true });
  cfgFile = path.join(ws, ".xenomoon.json");
  projectDir = path.join(ws, "site");
  mkdirSync(projectDir);
});
after(() => {
  rmSync(ws, { recursive: true, force: true });
});

/** Reset the temp install file, run one copied script, return its result and the file bytes.
 * @param {string} script @param {string[]} args */
function run(script, args) {
  writeFileSync(cfgFile, JSON.stringify(INITIAL, null, 2) + "\n");
  const before = readFileSync(cfgFile);
  const r = spawnSync(process.execPath, [path.join(ws, "ui", "server", "cli", script), ...args], {
    encoding: "utf8",
    env: { ...process.env, XENOMOON_REGISTRY: path.join(ws, "registry.json") },
  });
  return { status: r.status, stderr: r.stderr, before, after: readFileSync(cfgFile) };
}

test("bind-project-path <dir> refuses, names install-project, writes nothing", () => {
  const r = run("setup.js", [projectDir]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /npm run install-project -- ".*site"/);
  assert.ok(r.after.equals(r.before), ".xenomoon.json must be byte-identical");
});

test("bind-project-path <dir> --hermes-off refuses before the Hermes write too", () => {
  const r = run("setup.js", [projectDir, "--hermes-off"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /npm run install-project -- /);
  assert.ok(r.after.equals(r.before), ".xenomoon.json must be byte-identical");
});

test("bind-project-path --hermes-off still saves the Hermes block, nothing else", () => {
  const r = run("setup.js", ["--hermes-off"]);
  assert.equal(r.status, 0, r.stderr);
  const cfg = /** @type {Record<string, unknown>} */ (parseJSON(r.after.toString()));
  assert.deepEqual(cfg, { ...INITIAL, hermes: { enabled: false, model: "m" } });
});

test("start-project --add refuses, names install-project, writes nothing", () => {
  const r = run("start-profile.js", ["--add", "site", projectDir, "--port=4000"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /npm run install-project -- ".*site"/);
  assert.ok(r.after.equals(r.before), ".xenomoon.json must be byte-identical");
});
