// An install must OWN a port. The bug these pin: two installs with no saved port both resolve
// to the same default, and the server that starts first serves the other install's UI —
// silently, because nothing crashes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { savedPort, otherInstallPorts, firstFreePort, DEFAULT_PORT } from "./port-pick.js";

const root = mkdtempSync(path.join(tmpdir(), "xm-ports-"));
/** @param {string} name @param {number | null} port @returns {string} */
function install(name, port) {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, ".xenomoon.json"),
    JSON.stringify(port === null ? { projectDir: "/p" } : { projectDir: "/p", port }),
  );
  return dir;
}
/** The registry shape otherInstallPorts takes — dirs mapped to their project. @param {string[]} dirs */
const registry = (dirs) => Object.fromEntries(dirs.map((d) => [d, "/p"]));

test("a saved port is read; an install without one reports null", () => {
  assert.equal(savedPort(install("a", 3120)), 3120);
  assert.equal(savedPort(install("b", null)), null);
  assert.equal(savedPort(path.join(root, "nope")), null);
});

test("an install with NO saved port still claims the default", () => {
  // The heart of the bug: treating it as free is what let a second install take the same port.
  const other = install("c", null);
  assert.deepEqual(
    otherInstallPorts(path.join(root, "self"), registry([other, path.join(root, "self")])),
    [DEFAULT_PORT],
  );
});

test("this install's own port is not counted against it", () => {
  const self = install("self2", 3117);
  assert.deepEqual(otherInstallPorts(self, registry([self])), []);
});

test("a registry entry whose directory is gone claims nothing", () => {
  assert.deepEqual(
    otherInstallPorts(path.join(root, "self3"), registry([path.join(root, "deleted-install")])),
    [],
  );
});

test("the suggestion steps past every claimed port", () => {
  assert.equal(firstFreePort(3117, []), 3117);
  assert.equal(firstFreePort(3117, [3117]), 3118);
  assert.equal(firstFreePort(3117, [3117, 3118, 3119]), 3120);
  assert.equal(firstFreePort(3117, [3118]), 3117, "gaps below are still free");
});

test("the search is bounded rather than spinning on a pathological registry", () => {
  const taken = Array.from({ length: 5000 }, (_, i) => 3117 + i);
  assert.ok(firstFreePort(3117, taken) <= 3117 + 1000);
});

process.on("exit", () => {
  rmSync(root, { recursive: true, force: true });
});
