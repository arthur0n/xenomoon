// install-capabilities (#73 row 8): kind indexes are merged, not clobbered. Each test installs a
// minimal pack into a temp framework dir (copies of real, strict-valid records); the real plugin/
// is never touched.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installCapabilities } from "./install-capabilities.js";
import { isInstallOutput } from "../core/install-output.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CORE_REC = fs.readFileSync(
  path.join(REPO, "plugin/library/sources/framework-sources.md"),
  "utf8",
);
const PACK_REC = fs.readFileSync(
  path.join(REPO, "domains/webapp/plugin/library/sources/skill-sources.md"),
  "utf8",
);
const SEED = "# sources — index\n";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "install-capabilities-test-"));
after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A temp framework with CORE `sources` (one record) and pack "t" shipping its own `sources`.
 * @param {string} name @param {Record<string, string>} [packExtra] pack-plugin-relative files */
function framework(name, packExtra = {}) {
  const dir = path.join(tmp, name);
  /** @type {Record<string, string>} */
  const files = {
    // The real tree always has plugin/hooks/ (the installer writes its .generated files there).
    "plugin/hooks/hooks.json": '{"hooks": {}}\n',
    "plugin/library/sources/index.md": "# sources — index\n\nCORE header line.\n",
    "plugin/library/sources/framework-sources.md": CORE_REC,
    "domains/t/plugin/library/sources/index.md": `${SEED}\nPACK header line.\n`,
    "domains/t/plugin/library/sources/skill-sources.md": PACK_REC,
    "domains/t/domain.json": JSON.stringify({
      engine: { name: "node", projectFile: "package.json" },
      inventory: { scenes: [], scripts: [".js"] },
      plugin: "domains/t/plugin",
      orchestrator: "domains/t/orchestrator.md",
    }),
    ...Object.fromEntries(Object.entries(packExtra).map(([k, v]) => [`domains/t/plugin/${k}`, v])),
  };
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

/** @param {string} dir @param {string} rel */
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), "utf8");

test("installed kind index lists CORE and pack records under CORE's header", () => {
  const dir = framework("merge");
  installCapabilities(dir, "t");
  const index = read(dir, "plugin/library/sources/index.md");
  assert.match(index, /\]\(framework-sources\.md\)/);
  assert.match(index, /\]\(skill-sources\.md\)/);
  assert.match(index, /CORE header line\./);
  assert.doesNotMatch(index, /PACK header line\./);
});

test("CORE's kind index is never declared install output; pack records are", () => {
  const dir = framework("manifest");
  installCapabilities(dir, "t");
  const manifest = read(dir, "plugin/.gitignore").split("\n");
  assert.ok(manifest.includes("/library/sources/skill-sources.md"), manifest.join("\n"));
  assert.ok(!manifest.includes("/library/sources/index.md"), manifest.join("\n"));
});

/** A framework whose pack also ships a kind CORE does not have. @param {string} name */
const withPackOnlyKind = (name) =>
  framework(name, {
    "library/extra/index.md": "# extra — index\n",
    "library/extra/skill-sources.md": PACK_REC.replace("type: sources", "type: extra"),
  });

test("a pack-only kind index is rebuilt and declared install output; CORE's is not", () => {
  const dir = withPackOnlyKind("pack-only");
  installCapabilities(dir, "t");
  const index = read(dir, "plugin/library/extra/index.md");
  assert.match(index, /^# extra — index\n/);
  assert.match(index, /\]\(skill-sources\.md\)/);
  const manifest = read(dir, "plugin/.gitignore").split("\n");
  assert.ok(manifest.includes("/library/extra/index.md"), manifest.join("\n"));
  assert.ok(!manifest.includes("/library/sources/index.md"), manifest.join("\n"));
});

test("a re-install keeps the pack-only kind index declared", () => {
  const dir = withPackOnlyKind("reinstall");
  installCapabilities(dir, "t");
  installCapabilities(dir, "t");
  const manifest = read(dir, "plugin/.gitignore").split("\n");
  assert.ok(manifest.includes("/library/extra/index.md"), manifest.join("\n"));
  assert.ok(!manifest.includes("/library/sources/index.md"), manifest.join("\n"));
});

test("a pack whose library fails the strict check is refused before any write", () => {
  const dir = framework("broken", { "library/sources/no-frontmatter.md": "# just text\n" });
  const coreIndex = read(dir, "plugin/library/sources/index.md");
  assert.throws(
    () => installCapabilities(dir, "t"),
    /installed library fails the strict check[\s\S]*no-frontmatter\.md: no frontmatter/,
  );
  for (const rel of [
    "plugin/.gitignore",
    "plugin/library/sources/skill-sources.md",
    "plugin/library/sources/no-frontmatter.md",
    "plugin/hooks/framework-root.generated",
    ".xenomoon.json",
  ])
    assert.ok(!fs.existsSync(path.join(dir, rel)), `${rel} was written`);
  assert.equal(read(dir, "plugin/library/sources/index.md"), coreIndex);
});

test("isInstallOutput reads the manifest the installer wrote; no manifest means nothing is", () => {
  const dir = framework("reader");
  const plugin = path.join(dir, "plugin");
  const record = path.join(plugin, "library/sources/skill-sources.md");
  assert.equal(isInstallOutput(plugin, record), false);
  installCapabilities(dir, "t");
  assert.equal(isInstallOutput(plugin, record), true);
  assert.equal(isInstallOutput(plugin, path.join(plugin, "library/sources/index.md")), false);
});
