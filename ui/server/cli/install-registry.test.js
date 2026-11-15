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
import { execFileSync } from "node:child_process";
import { isInstallDir, parseRegistry, registryValue, resolveInstall } from "./install-registry.js";

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

/** Expect a refusal whose reason names `field`.
 * @param {string} text @param {string} field */
function assertRefused(text, field) {
  const r = parseRegistry(text);
  assert.equal(r.ok, false);
  assert.ok(
    !r.ok && r.reason.includes(field),
    `reason should name "${field}": ${JSON.stringify(r)}`,
  );
}

test("a registry with two installs, one without a project, parses to its installs", () => {
  const installs = { "/tmp/install-a": "/tmp/project-a", "/tmp/install-b": null };
  assert.deepEqual(parseRegistry(JSON.stringify({ version: 1, installs })), { ok: true, installs });
});

test("a registry with no installs parses to an empty map", () => {
  assert.deepEqual(parseRegistry('{"version":1,"installs":{}}'), { ok: true, installs: {} });
});

test("text that is not JSON is refused as invalid JSON", () => {
  assertRefused("{ not json", "JSON");
});

test("a registry at version 2 is refused on version", () => {
  assertRefused('{"version":2,"installs":{}}', "version");
});

test("a registry whose installs is an array is refused on installs", () => {
  assertRefused('{"version":1,"installs":["/tmp/install-a"]}', "installs");
});

test("an install whose project is a number is refused on that install", () => {
  assertRefused('{"version":1,"installs":{"/tmp/install-a":42}}', "/tmp/install-a");
});

// resolveInstall's project step: the registry gives the installs (keys), each install's own
// `projects` map gives the projects. Paths under /w and /i hold no real install, so the
// "cwd is inside an install" step never fires; the registry and the files are injected.

/** A fake readFile serving `<install>/.xenomoon.json` with the given projects; else ENOENT.
 * @param {Record<string, Record<string, { dir: string, port?: number }>>} byInstall
 * @returns {(file: string) => string} */
const projectFiles = (byInstall) => (file) => {
  const projects = byInstall[path.dirname(file)];
  if (projects) return JSON.stringify({ projects });
  throw Object.assign(new Error("ENOENT: simulated"), { code: "ENOENT" });
};

/** @param {Record<string, string|null>} installs */
const registryOf = (installs) => () => installs;

test("resolveInstall: cwd in the second project of an install resolves to that install", () => {
  const readFile = projectFiles({
    "/i/a": { one: { dir: "/w/one" }, two: { dir: "/w/two", port: 4200 } },
    "/i/b": { other: { dir: "/w/other" } },
  });
  const registry = registryOf({ "/i/a": "/w/one", "/i/b": null });
  const r = resolveInstall("/w/two/src", "/fallback", null, { registry, readFile });
  assert.equal(r.root, "/i/a");
  assert.match(r.how, /"two"/);
  assert.deepEqual(r.project, {
    install: "/i/a",
    name: "two",
    dir: "/w/two",
    port: 4200,
  });
});

test("resolveInstall: the deepest project dir wins across installs", () => {
  const readFile = projectFiles({
    "/i/a": { outer: { dir: "/w/p" } },
    "/i/b": { inner: { dir: "/w/p/sub" } },
  });
  const registry = registryOf({ "/i/a": null, "/i/b": null });
  const r = resolveInstall("/w/p/sub/x", "/fallback", null, { registry, readFile });
  assert.equal(r.root, "/i/b");
  assert.equal(r.project?.name, "inner");
});

test("resolveInstall: a project folder listed by two installs is refused as ambiguous", () => {
  const readFile = projectFiles({
    "/i/a": { p: { dir: "/w/p" } },
    "/i/b": { q: { dir: "/w/p" } },
    "/i/c": {},
  });
  const registry = registryOf({ "/i/a": null, "/i/b": null, "/i/c": null });
  const r = resolveInstall("/w/p", "/fallback", null, { registry, readFile });
  assert.equal(r.root, null);
  assert.match(r.how, /ambiguous/);
  assert.match(r.how, /\/w\/p/);
  assert.deepEqual(r.candidates, [
    ["/i/a", "/w/p"],
    ["/i/b", "/w/p"],
  ]);
  assert.equal(r.project, undefined);
});

test("resolveInstall: a registry value pointing at cwd does not match when the map omits it", () => {
  const readFile = projectFiles({ "/i/a": {}, "/i/b": {} });
  const registry = registryOf({ "/i/a": "/w/p", "/i/b": null });
  const r = resolveInstall("/w/p", "/fallback", null, { registry, readFile });
  assert.equal(r.root, null);
  assert.equal(r.how, "ambiguous");
  assert.equal(r.project, undefined);
});

test("resolveInstall: outside every project, the only registered install is used", () => {
  const readFile = projectFiles({ "/i/a": { p: { dir: "/w/p" } } });
  const r = resolveInstall("/w/elsewhere", "/fallback", null, {
    registry: registryOf({ "/i/a": null }),
    readFile,
  });
  assert.equal(r.root, "/i/a");
  assert.equal(r.how, "the only registered install");
  assert.equal(r.project, undefined);
});

test("resolveInstall: an empty registry falls back to the CLI's own install", () => {
  const r = resolveInstall("/w/p", "/fallback", null, {
    registry: registryOf({}),
    readFile: projectFiles({}),
  });
  assert.deepEqual(r, { root: "/fallback", how: "linked CLI — nothing registered" });
});

// registerInstall's value (#65): the registry lists installs, not projects. REGISTRY_FILE is
// fixed at import time, so the rule is tested pure and the wiring once in a child process.

test("registryValue: a new install with a projects map is recorded as null", () => {
  assert.equal(registryValue(undefined, true), null);
});

test("registryValue: an old project string is replaced by null once the map has a project", () => {
  assert.equal(registryValue("/w/old", true), null);
});

test("registryValue: an install with no projects map keeps its legacy project string", () => {
  assert.equal(registryValue("/w/old", false), "/w/old");
  assert.equal(registryValue(undefined, false), null);
});

test("registryValue: a passed project is ignored when the map has projects", () => {
  assert.equal(registryValue(null, true, "/w/new"), null);
  assert.equal(registryValue("/w/old", true, "/w/new"), null);
});

test("registerInstall: an install with a projects map drops its old string and the passed project", () => {
  const install = dirNamed("xenomoon");
  writeFileSync(
    path.join(install, ".xenomoon.json"),
    JSON.stringify({ projects: { app: { dir: "/w/app" } } }),
  );
  const registry = path.join(mkdtempSync(path.join(tmpdir(), "xm-reg-")), "installs.json");
  writeFileSync(registry, JSON.stringify({ version: 1, installs: { [install]: "/w/old" } }));
  const mod = new URL("./install-registry.js", import.meta.url).href;
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const m = await import(${JSON.stringify(mod)}); m.registerInstall(process.argv[1], "/w/new");`,
      install,
    ],
    { env: { ...process.env, XENOMOON_REGISTRY: registry }, stdio: "pipe" },
  );
  const reg = /** @type {{ installs: Record<string, string|null> }} */ (
    parseJSON(readFileSync(registry, "utf8"))
  );
  assert.deepEqual(reg.installs, { [install]: null });
});
