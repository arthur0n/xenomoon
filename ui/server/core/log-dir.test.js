// LOG_DIR (#62): config.js points the log dir and its env export at the project side.
// Probed in a subprocess because config.js resolves the project at import time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseJSON } from "../../lib/json.js";
import { projectLogDir } from "../../lib/project-paths.js";

const configUrl = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "config.js"),
).href;
const projectDir = realpathSync(mkdtempSync(path.join(tmpdir(), "xm-logdir-")));
/** @type {{ LOG_DIR: string, env: string }} */
let probed;
try {
  const out = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { LOG_DIR } from ${JSON.stringify(configUrl)}; ` +
        "console.log(JSON.stringify({ LOG_DIR, env: process.env.XENOMOON_LOG_DIR }));",
    ],
    { env: { ...process.env, GAME_DIR: projectDir, XENOMOON_DOMAIN: "webapp" }, encoding: "utf8" },
  );
  probed = /** @type {{ LOG_DIR: string, env: string }} */ (
    parseJSON(out.trim().split("\n").pop() ?? "")
  );
} finally {
  rmSync(projectDir, { recursive: true, force: true });
}

test("LOG_DIR is the project-side log dir", () => {
  assert.equal(probed.LOG_DIR, projectLogDir(projectDir));
});

test("XENOMOON_LOG_DIR env carries the same project-side dir for the hooks", () => {
  assert.equal(probed.env, projectLogDir(projectDir));
});
