// project-settings.js (#84): per-project settings file and the project-dir resolver.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs, {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { projectSettingsFile } from "./project-paths.js";
import {
  hasProjectSetting,
  normalizeActionPolicy,
  readActionPolicy,
  readBrowserSettings,
  readProjectSettings,
  resolveProjectDir,
  writeProjectSettings,
} from "./project-settings.js";

/** Run `fn` with a fresh temp dir (real path), removed afterwards. @param {(dir: string) => void} fn */
function withTmp(fn) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "xm-projsettings-")));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @param {string} dir @param {string} text */
function writeSettings(dir, text) {
  mkdirSync(path.join(dir, ".xenomoon"), { recursive: true });
  writeFileSync(projectSettingsFile(dir), text);
}

test("projectSettingsFile joins <dir>/.xenomoon/settings.json", () => {
  assert.equal(projectSettingsFile("/p"), path.join("/p", ".xenomoon", "settings.json"));
});

test("readProjectSettings on a missing file reads not onboarded, empty policy", () => {
  withTmp((dir) => {
    assert.deepEqual(readProjectSettings(dir), { onboarded: false, policy: {} });
  });
});

test("readProjectSettings on bad content (not JSON, array, null) reads the defaults", () => {
  withTmp((dir) => {
    for (const text of ["{not json", '[{"onboarded":true}]', "null"]) {
      writeSettings(dir, text);
      assert.deepEqual(readProjectSettings(dir), { onboarded: false, policy: {} }, text);
    }
  });
});

test("readProjectSettings returns onboarded true and the policy object from a good file", () => {
  withTmp((dir) => {
    writeSettings(dir, JSON.stringify({ onboarded: true, policy: { push: "ask" } }));
    assert.deepEqual(readProjectSettings(dir), { onboarded: true, policy: { push: "ask" } });
  });
});

test("readProjectSettings: onboarded only on literal true, policy only when a plain object", () => {
  withTmp((dir) => {
    writeSettings(dir, JSON.stringify({ onboarded: "true", policy: ["push"] }));
    assert.deepEqual(readProjectSettings(dir), { onboarded: false, policy: {} });
    writeSettings(dir, JSON.stringify({ onboarded: 1, policy: "ask" }));
    assert.deepEqual(readProjectSettings(dir), { onboarded: false, policy: {} });
  });
});

test("hasProjectSetting tells a present key (any value) from a missing one or a missing file", () => {
  withTmp((dir) => {
    assert.equal(hasProjectSetting(dir, "policy"), false);
    writeSettings(dir, JSON.stringify({ onboarded: false, policy: null }));
    assert.equal(hasProjectSetting(dir, "onboarded"), true);
    assert.equal(hasProjectSetting(dir, "policy"), true);
    assert.equal(hasProjectSetting(dir, "other"), false);
  });
});

test("writeProjectSettings creates .xenomoon/ and writes pretty JSON with a trailing newline", () => {
  withTmp((dir) => {
    assert.equal(writeProjectSettings(dir, { onboarded: true }), true);
    assert.equal(readFileSync(projectSettingsFile(dir), "utf8"), '{\n  "onboarded": true\n}\n');
  });
});

test("writeProjectSettings merges the patch and keeps every other key", () => {
  withTmp((dir) => {
    writeSettings(dir, JSON.stringify({ onboarded: true, other: 7 }));
    assert.equal(writeProjectSettings(dir, { policy: { push: "deny" } }), true);
    assert.deepEqual(JSON.parse(readFileSync(projectSettingsFile(dir), "utf8")), {
      onboarded: true,
      other: 7,
      policy: { push: "deny" },
    });
  });
});

test("writeProjectSettings refuses a missing project dir: false, nothing created", () => {
  withTmp((dir) => {
    const missing = path.join(dir, "no-such-project");
    assert.equal(writeProjectSettings(missing, { onboarded: true }), false);
    assert.equal(existsSync(missing), false);
  });
});

test("writeProjectSettings returns false, never throws, when .xenomoon is a file", () => {
  withTmp((dir) => {
    writeFileSync(path.join(dir, ".xenomoon"), "");
    assert.equal(writeProjectSettings(dir, { onboarded: true }), false);
  });
});

test("resolveProjectDir finds the nearest ancestor with a .xenomoon dir, cwd included", () => {
  withTmp((dir) => {
    const home = path.join(dir, "home");
    const proj = path.join(home, "proj");
    const nested = path.join(proj, "sub", "deep");
    mkdirSync(path.join(proj, ".xenomoon"), { recursive: true });
    mkdirSync(nested, { recursive: true });
    assert.equal(resolveProjectDir(nested, home), proj);
    assert.equal(resolveProjectDir(proj, home), proj);
  });
});

test("resolveProjectDir ignores a .xenomoon file (not a directory)", () => {
  withTmp((dir) => {
    const home = path.join(dir, "home");
    const proj = path.join(home, "proj");
    mkdirSync(proj, { recursive: true });
    writeFileSync(path.join(proj, ".xenomoon"), "");
    assert.equal(resolveProjectDir(proj, home), "");
  });
});

test("resolveProjectDir never returns home and keeps nothing above it", () => {
  withTmp((dir) => {
    const home = path.join(dir, "home");
    const sub = path.join(home, "work");
    mkdirSync(path.join(home, ".xenomoon"), { recursive: true });
    mkdirSync(path.join(dir, ".xenomoon"));
    mkdirSync(sub);
    assert.equal(resolveProjectDir(sub, home), "");
    assert.equal(resolveProjectDir(home, home), "");
  });
});

test("resolveProjectDir compares real paths: a symlinked cwd and home still stop at home", () => {
  withTmp((dir) => {
    const home = path.join(dir, "home");
    const sub = path.join(home, "work");
    mkdirSync(path.join(home, ".xenomoon"), { recursive: true });
    mkdirSync(path.join(dir, ".xenomoon"));
    mkdirSync(sub);
    const linkHome = path.join(dir, "link-home");
    symlinkSync(home, linkHome);
    assert.equal(resolveProjectDir(path.join(linkHome, "work"), home), "");
    assert.equal(resolveProjectDir(sub, linkHome), "");
  });
});

test("resolveProjectDir on an empty or non-string cwd returns empty, never throws", () => {
  assert.equal(resolveProjectDir(""), "");
  assert.equal(resolveProjectDir(/** @type {any} */ (undefined)), "");
});

const ASK_ALL = {
  push: "ask",
  merge: "ask",
  dependencies: "ask",
  branchCreate: "ask",
  spend: "ask",
  migrationPush: "ask",
  codexReview: "ask",
  migrationsPending: "",
  spendPatterns: [],
};

test("normalizeActionPolicy on a non-object (undefined, null, array, string) is all ask", () => {
  for (const raw of [undefined, null, ["push"], "allow"]) {
    assert.deepEqual(normalizeActionPolicy(raw), ASK_ALL, String(raw));
  }
});

test("normalizeActionPolicy allows only the literal string allow, per key", () => {
  const p = normalizeActionPolicy({
    push: "allow",
    merge: true,
    dependencies: "ALLOW",
    branchCreate: "allow ",
    spend: 1,
    migrationPush: "allow",
    codexReview: "yes",
  });
  assert.equal(p.push, "allow");
  assert.equal(p.migrationPush, "allow");
  for (const k of /** @type {const} */ ([
    "merge",
    "dependencies",
    "branchCreate",
    "spend",
    "codexReview",
  ]))
    assert.equal(p[k], "ask", k);
});

test("normalizeActionPolicy returns the full key set, dropping unknown keys", () => {
  const p = normalizeActionPolicy({ push: "allow", rogue: "allow" });
  assert.deepEqual(Object.keys(p).sort(), Object.keys(ASK_ALL).sort());
});

test("normalizeActionPolicy keeps migrationsPending only when a string", () => {
  assert.equal(
    normalizeActionPolicy({ migrationsPending: "db:pending" }).migrationsPending,
    "db:pending",
  );
  assert.equal(normalizeActionPolicy({ migrationsPending: 7 }).migrationsPending, "");
});

test("normalizeActionPolicy keeps only non-empty string spendPatterns", () => {
  const raw = { spendPatterns: ["eval:run", "", 3, null, "bill"] };
  assert.deepEqual(normalizeActionPolicy(raw).spendPatterns, ["eval:run", "bill"]);
  assert.deepEqual(normalizeActionPolicy({ spendPatterns: "eval:run" }).spendPatterns, []);
});

test("readActionPolicy normalises the project file's policy; missing file is all ask", () => {
  withTmp((dir) => {
    assert.deepEqual(readActionPolicy(dir), ASK_ALL);
    writeSettings(dir, JSON.stringify({ policy: { merge: "allow", push: "no" } }));
    assert.deepEqual(readActionPolicy(dir), { ...ASK_ALL, merge: "allow" });
  });
});

test("resolveProjectDir rejects a relative cwd even when the process folder is a project", () => {
  // A child process, not process.chdir: chdir is process-wide (other tests in this process
  // would see it) and throws inside worker threads; the child's cwd is set by the spawn.
  withTmp((dir) => {
    const proj = path.join(dir, "home", "proj");
    mkdirSync(path.join(proj, "sub"), { recursive: true });
    mkdirSync(path.join(proj, ".xenomoon"), { recursive: true });
    const mod = new URL("./project-settings.js", import.meta.url).href;
    const home = path.join(dir, "home");
    const code = `const { resolveProjectDir: r } = await import(${JSON.stringify(mod)});
      process.stdout.write(JSON.stringify([".", "sub", "nonexistent-child", "./sub"].map((c) => r(c, ${JSON.stringify(home)}))));`;
    const res = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
      cwd: proj,
      encoding: "utf8",
    });
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(JSON.parse(res.stdout), ["", "", "", ""]);
  });
});

test("resolveProjectDir on a missing absolute path or a file returns empty", () => {
  withTmp((dir) => {
    const proj = path.join(dir, "home", "proj");
    mkdirSync(path.join(proj, ".xenomoon"), { recursive: true });
    const file = path.join(proj, "a.txt");
    writeFileSync(file, "");
    const home = path.join(dir, "home");
    assert.equal(resolveProjectDir(path.join(proj, "no-such-dir"), home), "");
    assert.equal(resolveProjectDir(file, home), "");
  });
});

/** A project whose `.xenomoon` (or only its settings.json) links to another project's, which
 * says onboarded + push allow. @param {string} dir @param {"marker" | "file"} level */
function linkedProject(dir, level) {
  const other = path.join(dir, "home", "other");
  const proj = path.join(dir, "home", "proj");
  writeSettings(other, JSON.stringify({ onboarded: true, policy: { push: "allow" } }));
  mkdirSync(proj, { recursive: true });
  if (level === "marker") symlinkSync(path.join(other, ".xenomoon"), path.join(proj, ".xenomoon"));
  else {
    mkdirSync(path.join(proj, ".xenomoon"));
    symlinkSync(projectSettingsFile(other), projectSettingsFile(proj));
  }
  // The link target really says allow: through the link it is readable as such.
  const target = readFileSync(projectSettingsFile(proj), "utf8");
  assert.deepEqual(JSON.parse(target), { onboarded: true, policy: { push: "allow" } });
  return { proj, home: path.join(dir, "home"), target, otherFile: projectSettingsFile(other) };
}

test("a symlinked .xenomoon marker: not a project, reads defaults, write refused", () => {
  withTmp((dir) => {
    const { proj, home, target, otherFile } = linkedProject(dir, "marker");
    assert.equal(resolveProjectDir(proj, home), "");
    assert.deepEqual(readProjectSettings(proj), { onboarded: false, policy: {} });
    assert.deepEqual(readActionPolicy(proj), ASK_ALL);
    assert.equal(hasProjectSetting(proj, "policy"), false);
    assert.equal(writeProjectSettings(proj, { onboarded: false }), false);
    assert.equal(readFileSync(otherFile, "utf8"), target);
  });
});

test("a symlinked settings.json: reads defaults, write refused, target unchanged", () => {
  withTmp((dir) => {
    const { proj, target, otherFile } = linkedProject(dir, "file");
    assert.deepEqual(readProjectSettings(proj), { onboarded: false, policy: {} });
    assert.deepEqual(readActionPolicy(proj), ASK_ALL);
    assert.equal(hasProjectSetting(proj, "onboarded"), false);
    assert.equal(writeProjectSettings(proj, { onboarded: false }), false);
    assert.equal(readFileSync(otherFile, "utf8"), target);
  });
});

test("settings.json that is a directory: reads defaults, write refused", () => {
  withTmp((dir) => {
    mkdirSync(projectSettingsFile(dir), { recursive: true });
    assert.deepEqual(readProjectSettings(dir), { onboarded: false, policy: {} });
    assert.equal(writeProjectSettings(dir, { onboarded: true }), false);
  });
});

test("writeProjectSettings replaces the file whole and leaves no temp file", () => {
  withTmp((dir) => {
    writeSettings(dir, JSON.stringify({ onboarded: false, other: 7 }));
    assert.equal(writeProjectSettings(dir, { onboarded: true }), true);
    assert.deepEqual(JSON.parse(readFileSync(projectSettingsFile(dir), "utf8")), {
      onboarded: true,
      other: 7,
    });
    assert.deepEqual(readdirSync(path.join(dir, ".xenomoon")), ["settings.json"]);
  });
});

test("writeProjectSettings on a failed rename: false, old content intact, temp removed", () => {
  withTmp((dir) => {
    const old = JSON.stringify({ onboarded: false, policy: { push: "ask" } });
    writeSettings(dir, old);
    const realRename = fs.renameSync;
    fs.renameSync = () => {
      throw Object.assign(new Error("EIO"), { code: "EIO" });
    };
    syncBuiltinESMExports();
    try {
      assert.equal(writeProjectSettings(dir, { onboarded: true }), false);
    } finally {
      fs.renameSync = realRename;
      syncBuiltinESMExports();
    }
    assert.equal(readFileSync(projectSettingsFile(dir), "utf8"), old);
    assert.deepEqual(readdirSync(path.join(dir, ".xenomoon")), ["settings.json"]);
  });
});

test("readBrowserSettings returns the project's browser.deviceId", () => {
  withTmp((dir) => {
    writeSettings(dir, JSON.stringify({ browser: { deviceId: "id-1" } }));
    assert.deepEqual(readBrowserSettings(dir), { deviceId: "id-1" });
  });
});

test("readBrowserSettings reads empty for a missing file, block, key, empty string or non-string", () => {
  withTmp((dir) => {
    assert.deepEqual(readBrowserSettings(dir), { deviceId: "" });
    for (const settings of [
      {},
      { browser: {} },
      { browser: { deviceId: "" } },
      { browser: { deviceId: 5 } },
      { browser: { deviceId: ["id-1"] } },
      { browser: "id-1" },
    ]) {
      writeSettings(dir, JSON.stringify(settings));
      assert.deepEqual(readBrowserSettings(dir), { deviceId: "" }, JSON.stringify(settings));
    }
  });
});
