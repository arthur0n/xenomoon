// config.js onboarded/policy wrappers read and write the PROJECT's settings file (#84).
// config.js resolves PROJECT_DIR from argv and sets env vars at import, so each case runs in a
// child process with a temp project dir as its argv.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectSettingsFile } from "../../lib/project-paths.js";

const CONFIG = path.join(path.dirname(fileURLToPath(import.meta.url)), "config.js");

/** Import config.js in a child with `projectDir` as argv, run `body`, return its JSON output.
 * @param {string} projectDir @param {string} body an expression using `c` (the module)
 * @returns {unknown} */
function inChild(projectDir, body) {
  const script = `const c = await import(process.argv[1]); console.log(JSON.stringify(${body}));`;
  const out = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", script, CONFIG, projectDir],
    { env: { ...process.env, XENOMOON_DOMAIN: "webapp", GAME_DIR: "" }, encoding: "utf8" },
  );
  return /** @type {unknown} */ (JSON.parse(out));
}

/** @param {(dir: string) => void} fn */
function withProject(fn) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "xm-cfgsettings-")));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @param {string} dir @param {unknown} data */
function writeSettings(dir, data) {
  mkdirSync(path.join(dir, ".xenomoon"), { recursive: true });
  writeFileSync(projectSettingsFile(dir), JSON.stringify(data));
}

test("getOnboarded: missing project file is false; project file onboarded:true is true", () => {
  withProject((dir) => {
    assert.deepEqual(inChild(dir, "[c.PROJECT_DIR, c.getOnboarded()]"), [dir, false]);
    writeSettings(dir, { onboarded: true });
    assert.equal(inChild(dir, "c.getOnboarded()"), true);
  });
});

test("markOnboarded writes onboarded:true into the project file, keeping other keys", () => {
  withProject((dir) => {
    writeSettings(dir, { policy: { push: "allow" } });
    assert.equal(inChild(dir, "(c.markOnboarded(), c.getOnboarded())"), true);
    assert.deepEqual(JSON.parse(readFileSync(projectSettingsFile(dir), "utf8")), {
      policy: { push: "allow" },
      onboarded: true,
    });
  });
});

test("getActionPolicy reads the project file's policy, normalised", () => {
  withProject((dir) => {
    assert.equal(inChild(dir, "c.getActionPolicy().push"), "ask");
    writeSettings(dir, { policy: { push: "allow", merge: true, spendPatterns: ["x", 1] } });
    const p = /** @type {Record<string, unknown>} */ (inChild(dir, "c.getActionPolicy()"));
    assert.equal(p.push, "allow");
    assert.equal(p.merge, "ask");
    assert.deepEqual(p.spendPatterns, ["x"]);
  });
});
