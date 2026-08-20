// The package's NAME is load-bearing twice, and both are invisible until something breaks far
// from here: npm resolves the cold-start `npx github:arthur0n/xenomoon` by running the bin named
// after the package, and install-registry treats that same name as the marker for "this directory
// is an install". Adding a second bin once made the documented first command unrunnable, with
// nothing red — these tests are the gate that was missing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";
import { isInstallDir } from "./install-registry.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pkg = /** @type {{ name: string, bin?: Record<string, string> }} */ (
  parseJSON(readFileSync(path.join(ROOT, "package.json"), "utf8"))
);

/** A throwaway directory whose package.json carries `name`.
 * @param {string | undefined} name @returns {string} */
function dirNamed(name) {
  const dir = mkdtempSync(path.join(tmpdir(), "xm-install-"));
  writeFileSync(path.join(dir, "package.json"), JSON.stringify(name ? { name } : {}));
  return dir;
}

test("a multi-bin manifest keeps a bin named after the package", () => {
  const bins = Object.keys(pkg.bin ?? {});
  // With exactly one bin npm runs it whatever it is called; the rule only bites past that.
  if (bins.length <= 1) return;
  assert.ok(
    bins.includes(pkg.name),
    `package "${pkg.name}" has ${bins.length} bins (${bins.join(", ")}) and none named after it — ` +
      "npx cannot choose, so the cold-start install fails with 'could not determine executable to run'",
  );
});

test("the framework root is recognised as an install", () => {
  assert.equal(isInstallDir(ROOT), true);
});

test("installs created before the rename are still installs", () => {
  assert.equal(isInstallDir(dirNamed("xenomoon-forge")), true);
});

test("an unrelated package directory is not an install", () => {
  assert.equal(isInstallDir(dirNamed("some-other-app")), false);
  assert.equal(isInstallDir(dirNamed(undefined)), false);
  assert.equal(isInstallDir(mkdtempSync(path.join(tmpdir(), "xm-empty-"))), false);
});
