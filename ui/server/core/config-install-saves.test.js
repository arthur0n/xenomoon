// saveHermesConfig / saveCodexConfig / saveKimiConfig keep the file's other keys and refuse on
// an unreadable file. config.js resolves its install from its own location, so it runs from a
// temp copy of the files it imports, in ONE child process whose JSON result the tests assert on.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";

const SRC_UI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const COPIED = [
  "server/core/config.js",
  "server/core/domain-resolver.js",
  "lib/install-config.js",
  "lib/json.js",
  "lib/shell.js",
  "lib/project-paths.js",
  "lib/project-settings.js",
];

const BASE = {
  domain: "webapp",
  domainDescriptor: { name: "webapp", engine: { name: "web", projectFile: "package.json" } },
  port: 3117,
  projects: { alpha: { dir: "/w/alpha", port: 3117 } },
  hermes: { enabled: false, apiKey: "secret", profile: "prof", model: "m1" },
  codex: { enabled: false, roles: ["c"] },
  kimi: { enabled: false, roles: ["k"] },
};

// Runs every case against the copy; argv: project dir, install root, base config JSON.
const CHILD = `
import { writeFileSync, readFileSync } from "node:fs";
const [, , project, root, baseText] = process.argv;
const file = root + "/.xenomoon.json";
writeFileSync(file, baseText);
const cfg = await import(root + "/ui/server/core/config.js");
const saves = {
  hermes: () => cfg.saveHermesConfig({ enabled: true, apiKey: "", profile: "", model: "m2" }),
  codex: () => cfg.saveCodexConfig({ enabled: true }),
  kimi: () => cfg.saveKimiConfig({ roles: ["r2"] }),
};
const out = { saved: {}, refused: {} };
for (const key of Object.keys(saves)) {
  writeFileSync(file, baseText);
  const result = saves[key]();
  out.saved[key] = { result, config: JSON.parse(readFileSync(file, "utf8")) };
}
for (const [label, text] of [["empty", ""], ["invalid", "{ not json"]]) {
  out.refused[label] = {};
  for (const key of Object.keys(saves)) {
    writeFileSync(file, text);
    const result = saves[key]();
    out.refused[label][key] = { result, text: readFileSync(file, "utf8") };
  }
}
console.log(JSON.stringify(out));
`;

let ws = "";
/** @typedef {Record<string, unknown>} Cfg */
/** @typedef {{ result: { ok?: true, error?: string }, config: Cfg }} Saved */
/** @typedef {{ result: { ok?: true, error?: string }, text: string }} Refused */
/** @type {{ saved: Record<string, Saved>, refused: Record<string, Record<string, Refused>> }} */
let run;

before(() => {
  ws = mkdtempSync(path.join(tmpdir(), "xm-config-saves-"));
  for (const rel of COPIED) {
    mkdirSync(path.dirname(path.join(ws, "ui", rel)), { recursive: true });
    cpSync(path.join(SRC_UI, rel), path.join(ws, "ui", rel));
  }
  const project = path.join(ws, "site");
  mkdirSync(project);
  const script = path.join(ws, "child.mjs");
  writeFileSync(script, CHILD);
  const r = spawnSync(
    process.execPath,
    [script, project, ws, JSON.stringify(BASE, null, 2) + "\n"],
    { encoding: "utf8", env: { ...process.env, GAME_DIR: "" } },
  );
  assert.equal(r.status, 0, r.stderr);
  // The child's import may log; the result is the last line.
  run = /** @type {typeof run} */ (parseJSON(r.stdout.trim().split("\n").pop() ?? ""));
});
after(() => {
  rmSync(ws, { recursive: true, force: true });
});

for (const key of /** @type {const} */ (["hermes", "codex", "kimi"])) {
  test(`save ${key}: ok, and projects, domain, descriptor, port and the other blocks stay`, () => {
    const { result, config } = /** @type {Saved} */ (run.saved[key]);
    assert.deepEqual(result, { ok: true });
    for (const k of Object.keys(BASE).filter((k) => k !== key))
      assert.deepEqual(config[k], /** @type {any} */ (BASE)[k], k);
    assert.notDeepEqual(config[key], /** @type {any} */ (BASE)[key]);
  });
}

test("saveHermesConfig: an empty apiKey and an empty profile keep the saved ones", () => {
  const hermes = /** @type {Cfg} */ (/** @type {Saved} */ (run.saved.hermes).config.hermes);
  assert.equal(hermes.apiKey, "secret");
  assert.equal(hermes.profile, "prof");
  assert.equal(hermes.model, "m2");
  assert.equal(hermes.enabled, true);
});

for (const label of ["empty", "invalid"]) {
  for (const key of ["hermes", "codex", "kimi"]) {
    test(`save ${key}: an ${label} file gives { error } and stays byte-identical`, () => {
      const { result, text } = /** @type {Refused} */ (
        /** @type {Record<string, Refused>} */ (run.refused[label])[key]
      );
      assert.equal(typeof result.error, "string");
      assert.match(result.error ?? "", /\.xenomoon\.json/);
      assert.equal(text, label === "empty" ? "" : "{ not json");
    });
  }
}
