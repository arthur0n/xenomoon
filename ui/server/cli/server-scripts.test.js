// server-port.sh is sourced by start_server and stop_server. These tests source it in a throwaway
// directory and read back what it defines, so the per-port run files and the port proof are pinned.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../server-port.sh");

/**
 * Source server-port.sh inside `cwd` and run `body`; returns the spawnSync result.
 * @param {string} cwd
 * @param {string} body
 * @param {NodeJS.ProcessEnv} env
 */
function sourceAndRun(cwd, body, env) {
  return spawnSync("bash", ["-c", `set -euo pipefail; source "$0"; ${body}`, SCRIPT], {
    cwd,
    env,
    encoding: "utf8",
  });
}

/**
 * The current env minus PORT, so a test decides the port itself.
 * @param {Record<string, string>} [extra]
 */
function envWithoutPort(extra = {}) {
  const env = { ...process.env, ...extra };
  if (!("PORT" in extra)) delete env.PORT;
  return env;
}

/** @param {(dir: string) => void} fn */
function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "xm-server-port-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function hasLsof() {
  try {
    execFileSync("bash", ["-c", "command -v lsof"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("PIDFILE and LOG carry the PORT env override", () => {
  withTempDir((dir) => {
    const r = sourceAndRun(dir, 'echo "$PIDFILE"; echo "$LOG"', envWithoutPort({ PORT: "4242" }));
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.stdout.trim().split("\n"), [".xm-run/ui.4242.pid", ".xm-run/ui.4242.log"]);
  });
});

test("PIDFILE and LOG carry the port configured in .xenomoon.json", () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, ".xenomoon.json"), JSON.stringify({ port: 5151 }));
    const r = sourceAndRun(dir, 'echo "$PIDFILE"; echo "$LOG"', envWithoutPort());
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.stdout.trim().split("\n"), [".xm-run/ui.5151.pid", ".xm-run/ui.5151.log"]);
  });
});

test("pid_listens_on_port refuses a pid that does not listen on the port", (t) => {
  if (!hasLsof()) {
    t.skip("lsof is not on PATH");
    return;
  }
  withTempDir((dir) => {
    // $$ is this bash process; port 1 is one it never listens on.
    const r = sourceAndRun(dir, "pid_listens_on_port $$ 1", envWithoutPort({ PORT: "4242" }));
    assert.notEqual(r.status, 0, "expected a non-zero exit for a pid not listening on the port");
  });
});
