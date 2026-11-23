// check-install-config-writes: one fixture per direct-write shape the repo held before
// updateInstallConfig, and the reads, other-file writes and updateInstallConfig calls that pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findInstallConfigWrites } from "./check-install-config-writes.js";

/** @param {string} src @returns {number[]} flagged line numbers */
const lines = (src) => findInstallConfigWrites(src).map((v) => v.line);

test("flags a write through the CONFIG_FILE name (config.js, setup.js, hermes-setup.js shape)", () => {
  const src = [
    'import { CONFIG_FILE } from "./config.js";',
    "function save(saved) {",
    '  writeFileSync(CONFIG_FILE, JSON.stringify(saved, null, 2) + "\\n");',
    '  const fd = openSync(CONFIG_FILE, "w");',
    "}",
  ].join("\n");
  assert.deepEqual(lines(src), [3, 4]);
});

test("flags a write through a local name built with path.join (project-entry.js shape)", () => {
  const src = [
    "export function mergeInstallConfig(installDir, patch) {",
    '  const file = path.join(installDir, ".xenomoon.json");',
    "  const target = file;",
    "  writeFileSync(",
    "    file,",
    '    JSON.stringify({ ...patch }, null, 2) + "\\n",',
    "  );",
    "  fs.promises.rename(tmp, target);",
    "}",
  ].join("\n");
  assert.deepEqual(lines(src), [4, 8]);
});

test("flags an inline literal path (project-entry.js addProjectEntry shape)", () => {
  const src = 'writeFileSync(path.join(installDir, ".xenomoon.json"), JSON.stringify(next));';
  assert.deepEqual(lines(src), [1]);
});

test("flags cfgFile but not names derived from the file's CONTENT (install-capabilities.js shape)", () => {
  const src = [
    'const cfgFile = path.join(frameworkDir, ".xenomoon.json");',
    'const cfg = parseJSON(readFileSync(cfgFile, "utf8"));',
    "const packDir = path.join(frameworkDir, cfg.plugin);",
    'copyFileSync(path.join(packDir, "a.sh"), path.join(pluginDir, "a.sh"));',
    "writeFileSync(cfgFile, JSON.stringify({ ...cfg, domain: current }));",
  ].join("\n");
  assert.deepEqual(lines(src), [5]);
});

test("passes reads, commented-out writes, other files and updateInstallConfig", () => {
  const src = [
    'const CONFIG_FILE = path.join(FRAMEWORK_DIR, ".xenomoon.json");',
    "// writeFileSync(CONFIG_FILE, text) is what this module never does",
    'const saved = parseJSON(readFileSync(CONFIG_FILE, "utf8"));',
    "const fd = openSync(CONFIG_FILE);",
    'writeFileSync(path.join(projectDir, ".xenomoon", "settings.json"), "{}");',
    "updateInstallConfig(FRAMEWORK_DIR, (cfg) => ({ next: { ...cfg, port: 1 } }));",
  ].join("\n");
  assert.deepEqual(lines(src), []);
});

/** Every write API with its path-argument shape, written out here (not imported) so a rule removed
 * from WRITE_CALLS turns its row red. */
const ONE_PATH = [
  "writeFileSync",
  "writeFile",
  "appendFileSync",
  "appendFile",
  "createWriteStream",
].concat(["truncateSync", "truncate", "rmSync", "rm", "unlinkSync", "unlink"]);
const TWO_PATHS = ["renameSync", "rename", "copyFileSync", "copyFile", "cpSync", "cp"];

/** @param {string} src @returns {string[]} flagged call names */
const calls = (src) => findInstallConfigWrites(src).map((v) => v.call);

for (const api of ONE_PATH)
  test(`flags ${api} of the install file`, () => {
    assert.deepEqual(calls(`${api}(CONFIG_FILE, text);`), [api]);
  });

for (const api of TWO_PATHS)
  test(`flags ${api} with the install file as source and as destination`, () => {
    assert.deepEqual(calls(`${api}(CONFIG_FILE, backup);`), [api]);
    assert.deepEqual(calls(`${api}(tmp, CONFIG_FILE);`), [api]);
  });

for (const api of ["openSync", "open"])
  test(`flags ${api} with a write flag, passes it with "r"`, () => {
    assert.deepEqual(calls(`${api}(CONFIG_FILE, "w");`), [api]);
    assert.deepEqual(calls(`${api}(CONFIG_FILE, "r");`), []);
  });

const CFG = 'const f = path.join(dir, ".xenomoon.json");';

test("flags import { X as Y } from each fs module", () => {
  for (const mod of ["node:fs", "fs", "node:fs/promises", "fs/promises"]) {
    const src = [
      `import { readFileSync, writeFileSync as save } from "${mod}";`,
      CFG,
      "save(f, t);",
    ];
    assert.deepEqual(findInstallConfigWrites(src.join("\n")), [
      { line: 3, text: "save(f, t);", call: "writeFileSync" },
    ]);
  }
  const other = ['import { writeFileSync as save } from "./store.js";', CFG, "save(f, t);"];
  assert.deepEqual(lines(other.join("\n")), []);
});

test("flags { X: Y } destructured from an fs namespace, not from another object", () => {
  for (const ns of ["fs", "fsp", "promises", 'require("fs")', "fs.promises", "disk"]) {
    const src = ['import * as disk from "node:fs";', `const { rename: mv } = ${ns};`, CFG];
    assert.deepEqual(lines([...src, "mv(tmp, f);"].join("\n")), [4], ns);
  }
  const other = ["const { rename: mv } = store;", CFG, "mv(tmp, f);"];
  assert.deepEqual(lines(other.join("\n")), []);
});

test("flags { X: Y } from a promises namespace taken out of an import", () => {
  const src = [
    'import { promises as p } from "fs";',
    "const { writeFile: w } = p;",
    CFG,
    "w(f, t);",
  ];
  assert.deepEqual(lines(src.join("\n")), [4]);
});

test("flags a re-assigned write function, also through a second alias", () => {
  const src = ["const save = writeFileSync;", "const put = fs.writeFileSync;", "let again = save;"];
  const body = ["save(f, t);", "put(f, t);", "again(f, t);"];
  assert.deepEqual(lines([...src, CFG, ...body].join("\n")), [5, 6, 7]);
  const other = ["const put = store.writeFileSync;", CFG, "put(f, t);"];
  assert.deepEqual(lines(other.join("\n")), []);
});

test("flags member calls on any name bound to fs", () => {
  const src = ['import * as f2 from "node:fs";', 'import fs2 from "fs";', CFG];
  assert.deepEqual(lines([...src, "f2.writeFileSync(f, t);", "fs2.rmSync(f);"].join("\n")), [4, 5]);
});

test("a write call written inside a string is not a call", () => {
  const src =
    'const note = "writeFileSync(\\".xenomoon.json\\", text)";\nconst t = `rm(${"x"}.xenomoon.json)`;';
  assert.deepEqual(lines(src), []);
});

test("a string mentioning a write and a real write: only the real one, on its line", () => {
  const src = [
    "const hint = 'never writeFileSync(CONFIG_FILE, x) here';",
    "",
    "writeFileSync(CONFIG_FILE, hint);",
  ];
  assert.deepEqual(lines(src.join("\n")), [3]);
});

test("a comma inside a string argument does not shift the argument positions", () => {
  assert.deepEqual(lines('renameSync("a,b.tmp", CONFIG_FILE);'), [1]);
});

/** Each path builder written out here (not imported), so a rule removed from PATH_BUILDERS turns
 * its row red: a name assigned through it stays the install file. */
for (const init of [
  'path.join(dir, ".xenomoon.json")',
  'path.resolve(dir, ".xenomoon.json")',
  "path.normalize(`${dir}/.xenomoon.json`)",
  "String(CONFIG_FILE)",
])
  test(`a name assigned from ${init} is the install file`, () => {
    assert.deepEqual(lines(`const f = ${init};\nwriteFileSync(f, t);`), [2]);
  });

for (const [label, split] of [
  ["two parts", '".xenomoon" + ".json"'],
  ["three parts, every quote kind", "'.xeno' + \"moon\" + `.json`"],
  ["a break after +", '".xenomoon" +\n  ".json"'],
])
  test(`a split literal is the install file: ${label}`, () => {
    const inline = `writeFileSync(path.join(dir, ${split}), t);`;
    assert.deepEqual(lines(`const x = 1;\n${inline}`), [2]);
    const named = `const file = path.join(dir, ${split});\nwriteFileSync(file, t);`;
    const at = named.split("\n").length;
    assert.deepEqual(findInstallConfigWrites(named), [
      { line: at, text: "writeFileSync(file, t);", call: "writeFileSync" },
    ]);
  });

test("a name assigned from a split that breaks after a top-level + is the install file", () => {
  const src = ['const name = ".xenomoon" +', '  ".json";', "rmSync(path.join(dir, name));"];
  assert.deepEqual(lines(src.join("\n")), [3]);
});

test("a split with a non-literal part or a `${}` template is not folded", () => {
  assert.deepEqual(lines('writeFileSync(path.join(dir, ".xenomoon" + ext + ".json"), t);'), []);
  assert.deepEqual(lines('writeFileSync(path.join(dir, `.xeno${m}` + "moon.json"), t);'), []);
});

test("policy: a name once bound to the install file stays it in the whole file", () => {
  const src = [
    'let file = path.join(dir, ".xenomoon.json");',
    "writeFileSync(file, x);",
    'file = path.join(dir, "other.json");',
    "writeFileSync(file, y);",
  ];
  assert.deepEqual(lines(src.join("\n")), [2, 4]);
});

test("ui/lib/install-config.js, the one sanctioned writer, passes", () => {
  const own = readFileSync(new URL("../../lib/install-config.js", import.meta.url), "utf8");
  assert.deepEqual(lines(own), []);
});
