// The diagnosis that turns "could not npm-link the CLI" into a one-line fix. Exercised
// against a throwaway npm prefix so the real machine's global bins are never touched.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { foreignBins, conflictReport } from "./link-conflicts.js";

const root = mkdtempSync(path.join(tmpdir(), "xm-bins-"));
const prefix = path.join(root, "globals");
const install = path.join(root, "install");
const other = path.join(root, "other");
/** @type {string | undefined} */
let savedPrefix;

before(() => {
  for (const d of [path.join(prefix, "bin"), path.join(install, "ui", "server", "cli"), other])
    mkdirSync(d, { recursive: true });
  writeFileSync(
    path.join(install, "package.json"),
    JSON.stringify({
      name: "xenomoon",
      bin: { xenomoon: "ui/server/cli/xenomoon.js", issuekit: "ui/server/cli/issuekit.js" },
    }),
  );
  for (const f of ["xenomoon.js", "issuekit.js"])
    writeFileSync(path.join(install, "ui", "server", "cli", f), "");
  writeFileSync(path.join(other, "issuekit.mjs"), "");
  // foreignBins asks npm for the prefix; npm honours this env var.
  savedPrefix = process.env.npm_config_prefix;
  process.env.npm_config_prefix = prefix;
});

after(() => {
  if (savedPrefix === undefined) delete process.env.npm_config_prefix;
  else process.env.npm_config_prefix = savedPrefix;
  rmSync(root, { recursive: true, force: true });
});

test("nothing on PATH: no conflicts", () => {
  assert.deepEqual(foreignBins(install), []);
});

test("a bin owned by another tool is named, with what it points at", () => {
  symlinkSync(path.join(other, "issuekit.mjs"), path.join(prefix, "bin", "issuekit"));
  const found = foreignBins(install);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.name, "issuekit");
  // realpathSync on the expectation too: macOS resolves /var → /private/var.
  assert.equal(found[0]?.owner, realpathSync(path.join(other, "issuekit.mjs")));
});

test("our OWN link is not a conflict — relinking the same install is fine", () => {
  symlinkSync(
    path.join(install, "ui", "server", "cli", "xenomoon.js"),
    path.join(prefix, "bin", "xenomoon"),
  );
  assert.deepEqual(
    foreignBins(install).map((c) => c.name),
    ["issuekit"],
  );
});

test("an install that does not exist yields no diagnosis rather than throwing", () => {
  assert.deepEqual(foreignBins(path.join(root, "absent")), []);
});

test("the report names every conflict and how to clear it", () => {
  const lines = conflictReport([{ name: "issuekit", owner: "/somewhere/else/issuekit.mjs" }]).join(
    "\n",
  );
  assert.match(lines, /`issuekit`/);
  assert.match(lines, /\/somewhere\/else\/issuekit\.mjs/);
  assert.match(lines, /npm link/);
});
