// Dry probe of the `xenomoon` project verbs: a TEMP fake install whose start_server/stop_server
// and npm scripts are stubs that print their argv and PORT and leave a marker file. No server is
// ever started; the registry is a temp file (XENOMOON_REGISTRY).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "xenomoon.js");
const STUB = `#!/usr/bin/env bash\necho "$(basename "$0") argv=$* PORT=$PORT"\ntouch "$(dirname "$0")/ran"\n`;
const PROBE = `require("fs").writeFileSync(__dirname + "/ran", "");
console.log(process.argv[2] + " argv=" + process.argv.slice(3).join(" ") + " PORT=" + process.env.PORT);`;

/** A temp workspace: one fake install `inst` and project folders `a` and `b` beside it.
 * @param {(ws: string) => Record<string, unknown>} config the install's .xenomoon.json */
function fakeInstall(config) {
  const ws = realpathSync(mkdtempSync(path.join(tmpdir(), "xm-project-")));
  const inst = path.join(ws, "inst");
  for (const d of [inst, path.join(ws, "a"), path.join(ws, "b")]) mkdirSync(d);
  const scripts = { doctor: "node probe.cjs doctor", "start-project": "node probe.cjs start" };
  writeFileSync(path.join(inst, "package.json"), JSON.stringify({ name: "xenomoon", scripts }));
  writeFileSync(path.join(inst, "probe.cjs"), PROBE);
  writeFileSync(path.join(inst, "start_server"), STUB);
  writeFileSync(path.join(inst, "stop_server"), STUB);
  writeFileSync(path.join(inst, ".xenomoon.json"), JSON.stringify(config(ws)));
  const registry = path.join(ws, "installs.json");
  writeFileSync(registry, JSON.stringify({ version: 1, installs: { [inst]: null } }));
  return { ws, inst, registry };
}

/** @param {ReturnType<typeof fakeInstall>} fx @param {string} cwd @param {string[]} args
 * @param {Record<string, string>} [extra] env set on purpose (PORT, XENOMOON_INSTALL) */
function cli(fx, cwd, args, extra = {}) {
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env, XENOMOON_REGISTRY: fx.registry };
  delete env.PORT;
  delete env.XENOMOON_INSTALL;
  Object.assign(env, extra);
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf8" });
  return {
    status: r.status,
    out: r.stdout,
    err: r.stderr,
    ran: existsSync(path.join(fx.inst, "ran")),
  };
}

/** @param {string} ws */
const two = (ws) => ({
  port: 3117,
  projects: {
    a: { dir: path.join(ws, "a"), port: 4001 },
    b: { dir: path.join(ws, "b"), port: 4002 },
  },
});

test("stop run from inside project b stops b's port, not the root port", () => {
  const fx = fakeInstall(two);
  const r = cli(fx, path.join(fx.ws, "b"), ["stop"]);
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /stop_server argv= PORT=4002/);
});

test("PORT=<a's port> stop from inside b: exit 1 naming both ports, stop_server never ran", () => {
  const fx = fakeInstall(two);
  const r = cli(fx, path.join(fx.ws, "b"), ["stop"], { PORT: "4001" });
  assert.equal(r.status, 1);
  assert.match(r.err, /PORT=4001 is set in the environment, but project "b" runs on port 4002/);
  assert.equal(r.ran, false, "stop_server must not have run");
});

test("XENOMOON_INSTALL=<install> stop from inside b stops b's port", () => {
  const fx = fakeInstall(two);
  const r = cli(fx, path.join(fx.ws, "b"), ["stop"], { XENOMOON_INSTALL: fx.inst });
  assert.equal(r.status, 0, r.err);
  assert.match(r.err, /explicit --install/);
  assert.match(r.out, /stop_server argv= PORT=4002/);
});

test("--install=<install> stop from inside b stops b's port", () => {
  const fx = fakeInstall(two);
  const r = cli(fx, path.join(fx.ws, "b"), [`--install=${fx.inst}`, "stop"]);
  assert.equal(r.status, 0, r.err);
  assert.match(r.err, /explicit --install/);
  assert.match(r.out, /stop_server argv= PORT=4002/);
});

test("--project=a sends a's dir and port to start_server", () => {
  const fx = fakeInstall(two);
  const r = cli(fx, fx.ws, [`--install=${fx.inst}`, "up", "--project=a"]);
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, new RegExp(`start_server argv=${path.join(fx.ws, "a")} PORT=4001`));
});

test("doctor receives the project dir through npm's -- arguments", () => {
  const fx = fakeInstall(two);
  const r = cli(fx, path.join(fx.ws, "a"), ["doctor"]);
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, new RegExp(`doctor argv=${path.join(fx.ws, "a")} PORT=4001`));
});

test("two projects and none chosen: exit 1, the choice explained, no script ran", () => {
  const fx = fakeInstall(two);
  const r = cli(fx, fx.inst, ["stop"]);
  assert.equal(r.status, 1);
  assert.match(r.err, /2 projects and cwd is in none of them/);
  assert.match(r.err, /projects: a, b/);
  assert.match(r.err, /--project=<name>/);
  assert.equal(r.ran, false, "stop_server must not have run");
});

test("a pre-projects-map install: exit 1 with the install-project command, no script ran", () => {
  const fx = fakeInstall((ws) => ({ projectDir: path.join(ws, "a") }));
  const legacy = path.join(fx.ws, "a");
  const r = cli(fx, fx.inst, ["doctor"]);
  assert.equal(r.status, 1);
  assert.ok(r.err.includes(`npm run install-project -- '${legacy}'`), r.err);
  assert.equal(r.ran, false, "doctor must not have run");
});
