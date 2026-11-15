// The term list the contamination gate accuses files with. It has to be complete enough to
// catch a real leak and narrow enough that the framework's own vocabulary survives.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  knownProjectTerms,
  namesFor,
  isUsableTerm,
  installProjectDirs,
  installTerms,
} from "./known-projects.js";

/** A readFile that serves `<install>/.xenomoon.json` from a map; anything else is ENOENT.
 * @param {Record<string, unknown>} files install dir → parsed descriptor */
function fakeInstalls(files) {
  return (/** @type {string} */ f) => {
    const cfg = files[path.dirname(f)];
    if (cfg === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    return JSON.stringify(cfg);
  };
}

test("a project's folder name is a term", () => {
  assert.deepEqual(namesFor("/ws/alpha"), ["alpha"]);
  assert.deepEqual(namesFor("/ws/Alpha"), ["alpha"], "matching is case-insensitive");
});

test("every registered install contributes, not just a bound one", () => {
  // The gap this closes: the trunk binds nothing, so the old list was empty and the gate
  // passed by having nothing to look for.
  const terms = knownProjectTerms({
    installs: { "/ws/alpha-xm": "/ws/alpha", "/ws/beta-xm": "/ws/beta" },
  });
  assert.deepEqual(terms, ["alpha", "beta"]);
});

test("a bound project counts even when the registry is empty", () => {
  assert.deepEqual(knownProjectTerms({ boundProjectDir: "/ws/gamma" }), ["gamma"]);
});

test("nothing known yields no terms — and the caller must say so, not pass silently", () => {
  assert.deepEqual(knownProjectTerms({}), []);
  assert.deepEqual(knownProjectTerms(), []);
});

test("generic words are never terms", () => {
  // A project named `api` would otherwise make the gate reject the framework's own vocabulary.
  for (const generic of ["ui", "app", "api", "core", "test", "docs", "project"])
    assert.equal(isUsableTerm(generic), false, generic);
  assert.equal(isUsableTerm("abc"), false, "too short to be evidence");
  assert.equal(isUsableTerm("alpha"), true);
});

test("generic project names are dropped from the list, not the whole list", () => {
  const terms = knownProjectTerms({
    installs: { "/ws/api-xm": "/ws/api", "/ws/alpha-xm": "/ws/alpha" },
  });
  assert.deepEqual(terms, ["alpha"]);
});

test("duplicates collapse and the order is stable", () => {
  const terms = knownProjectTerms({
    installs: { "/ws/a-xm": "/ws/zulu", "/ws/b-xm": "/ws/zulu", "/ws/c-xm": "/ws/alpha" },
  });
  assert.deepEqual(terms, ["alpha", "zulu"]);
});

test("junk registry entries are skipped rather than crashing the gate", () => {
  const terms = knownProjectTerms({
    installs: { "/ws/a-xm": null, "/ws/b-xm": "", "/ws/c-xm": 42, "/ws/d-xm": "/ws/alpha" },
  });
  assert.deepEqual(terms, ["alpha"]);
});

test("every project of every install is a term, not just the registry value", () => {
  // Rows 8-9 of #65: one install serves several projects; the registry value names one at most.
  const readFile = fakeInstalls({
    "/ws/one-xm": { projects: { a: { dir: "/ws/alpha-shop" }, b: { dir: "/ws/beta-app" } } },
    "/ws/two-xm": { projects: { c: { dir: "/ws/gamma-site" }, d: { dir: "/ws/delta-tool" } } },
  });
  const terms = knownProjectTerms({
    installs: { "/ws/one-xm": null, "/ws/two-xm": null },
    readFile,
  });
  assert.deepEqual(terms, ["alpha-shop", "beta-app", "delta-tool", "gamma-site"]);
});

test("a profile name is not a term by itself — only the project dir is", () => {
  const readFile = fakeInstalls({
    "/ws/one-xm": { projects: { zebrafish: { dir: "/ws/alpha-shop" } } },
  });
  assert.deepEqual(knownProjectTerms({ installs: { "/ws/one-xm": null }, readFile }), [
    "alpha-shop",
  ]);
});

test("a legacy registry value still counts next to the install's map", () => {
  // An install registered before the map existed must not lose its guard.
  const readFile = fakeInstalls({ "/ws/one-xm": { projects: { a: { dir: "/ws/beta-app" } } } });
  const terms = knownProjectTerms({
    installs: { "/ws/one-xm": "/ws/alpha-shop", "/ws/gone-xm": "/ws/gamma-site" },
    readFile,
  });
  assert.deepEqual(terms, ["alpha-shop", "beta-app", "gamma-site"]);
});

test("a root projectDir in an install's file counts", () => {
  const readFile = fakeInstalls({
    "/ws/one-xm": { projectDir: "/ws/alpha-shop", projects: { b: { dir: "/ws/beta-app" } } },
  });
  assert.deepEqual(knownProjectTerms({ installs: { "/ws/one-xm": null }, readFile }), [
    "alpha-shop",
    "beta-app",
  ]);
});

test("an empty registry yields no terms even when a reader is given (CI)", () => {
  assert.deepEqual(knownProjectTerms({ installs: {}, readFile: fakeInstalls({}) }), []);
});

test("installProjectDirs: every map dir (relative resolved) plus the root projectDir, deduped", () => {
  const readFile = fakeInstalls({
    "/ws/one-xm": {
      projectDir: "/ws/alpha-shop",
      projects: { a: { dir: "/ws/alpha-shop" }, b: { dir: "../beta-app" } },
    },
  });
  assert.deepEqual(installProjectDirs("/ws/one-xm", { readFile }), [
    "/ws/alpha-shop",
    "/ws/beta-app",
  ]);
});

test("installProjectDirs: no file, or an entry whose dir is not a string, gives no dirs", () => {
  assert.deepEqual(installProjectDirs("/ws/none-xm", { readFile: fakeInstalls({}) }), []);
  const bad = fakeInstalls({ "/ws/bad-xm": { projects: { a: { dir: 42 } } } });
  assert.deepEqual(installProjectDirs("/ws/bad-xm", { readFile: bad }), []);
});

test("installProjectDirs: one invalid entry does not blind the root dir or the valid entries", () => {
  const readFile = fakeInstalls({
    "/ws/one-xm": {
      projectDir: "/ws/alpha-shop",
      projects: { a: { dir: "/ws/beta-app" }, broken: { dir: 42 } },
    },
  });
  assert.deepEqual(installProjectDirs("/ws/one-xm", { readFile }), [
    "/ws/beta-app",
    "/ws/alpha-shop",
  ]);
  assert.deepEqual(knownProjectTerms({ installs: { "/ws/one-xm": null }, readFile }), [
    "alpha-shop",
    "beta-app",
  ]);
});

test("installProjectDirs: an entry with an invalid port or domain still contributes its dir", () => {
  const readFile = fakeInstalls({
    "/ws/one-xm": {
      projects: {
        a: { dir: "/ws/alpha-shop", port: "oops" },
        b: { dir: "/ws/beta-app", domain: 3 },
      },
    },
  });
  assert.deepEqual(installProjectDirs("/ws/one-xm", { readFile }), [
    "/ws/alpha-shop",
    "/ws/beta-app",
  ]);
});

test("installProjectDirs: invalid JSON trusts nothing", () => {
  const readFile = () => '{"projectDir": "/ws/alpha-shop",';
  assert.deepEqual(installProjectDirs("/ws/one-xm", { readFile }), []);
});

test("installTerms: denylist and business terms are the union over the install's projects", () => {
  const ws = mkdtempSync(path.join(os.tmpdir(), "known-projects-"));
  try {
    const beta = path.join(ws, "beta-app");
    mkdirSync(path.join(beta, ".claude", "library"), { recursive: true });
    const rule = "Every order over the limit needs a second approval.";
    writeFileSync(path.join(beta, ".claude", "library", "business-rules.md"), `- ${rule}\n`);
    const readFile = fakeInstalls({
      [ws]: { projects: { a: { dir: path.join(ws, "alpha-shop") }, b: { dir: beta } } },
    });
    assert.deepEqual(installTerms(ws, { readFile }), {
      denylist: ["alpha-shop", "beta-app"],
      businessTerms: [rule],
    });
    assert.deepEqual(installTerms(ws, { readFile: fakeInstalls({}) }), {
      denylist: [],
      businessTerms: [],
    });
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});
