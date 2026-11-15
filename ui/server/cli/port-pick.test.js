// An install must OWN a port. The bug these pin: two installs with no saved port both resolve
// to the same default, and the server that starts first serves the other install's UI —
// silently, because nothing crashes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  savedPort,
  otherInstallPorts,
  firstFreePort,
  claimedPorts,
  suggestProjectPort,
  portClaims,
  allocationRefusal,
  DEFAULT_PORT,
} from "./port-pick.js";

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

/** Injected install files: { installDir: configObject }. Every listed install exists; any
 * other read is ENOENT, so nothing here touches a real install or the real registry.
 * @param {Record<string, object>} configs */
function fakeFs(configs) {
  const files = new Map(
    Object.entries(configs).map(([dir, cfg]) => [
      path.join(path.resolve(dir), ".xenomoon.json"),
      JSON.stringify(cfg),
    ]),
  );
  return {
    installs: Object.fromEntries(Object.keys(configs).map((d) => [d, null])),
    deps: {
      /** @param {string} f */
      readFile: (f) => {
        const text = files.get(path.resolve(f));
        if (text === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        return text;
      },
      /** @param {string} d */
      exists: (d) => Object.keys(configs).some((k) => path.resolve(k) === path.resolve(d)),
    },
  };
}

test("two installs with several projects each claim every root and project port", () => {
  const { installs, deps } = fakeFs({
    "/i/one": {
      port: 3200,
      projects: { a: { dir: "/a", port: 3201 }, b: { dir: "/b", port: 3202 } },
    },
    "/i/two": {
      port: 3300,
      projects: { c: { dir: "/c", port: 3301 }, d: { dir: "/d", port: 3302 } },
    },
  });
  assert.deepEqual([...claimedPorts(installs, deps)].sort(), [3200, 3201, 3202, 3300, 3301, 3302]);
  assert.deepEqual(
    [...otherInstallPorts("/i/one", installs, deps)].sort(),
    [3300, 3301, 3302],
    "another install's PROJECT ports are claimed too, not only its root port",
  );
});

test("an install with no saved root port claims the default, next to its project ports", () => {
  const { installs, deps } = fakeFs({ "/i/bare": { projects: { a: { dir: "/a", port: 3400 } } } });
  assert.deepEqual([...claimedPorts(installs, deps)].sort(), [DEFAULT_PORT, 3400]);
});

test("a project with no port claims nothing", () => {
  const { installs, deps } = fakeFs({ "/i/np": { port: 3500, projects: { a: { dir: "/a" } } } });
  assert.deepEqual(claimedPorts(installs, deps), [3500]);
});

test("a second project of the same install is not offered the first project's port", () => {
  const { installs, deps } = fakeFs({
    "/i/self": { port: 3600, projects: { first: { dir: "/first", port: 3601 } } },
    "/i/other": { port: 3602 },
  });
  assert.equal(suggestProjectPort("/i/self", 3601, installs, deps), 3603);
  assert.equal(
    suggestProjectPort("/i/self", 3600, installs, deps),
    3603,
    "the install's own root port is claimed as well",
  );
});

test("a new project of an UNREGISTERED install still avoids that install's own ports", () => {
  const { deps } = fakeFs({ "/i/new": { port: 3700, projects: { a: { dir: "/a", port: 3701 } } } });
  assert.equal(suggestProjectPort("/i/new", 3700, {}, deps), 3702);
});

test("#79: the default installs map is the registry itself, so another install is seen", () => {
  // REGISTRY_FILE is resolved at import time, so the default path runs in a child process with
  // XENOMOON_REGISTRY pointing at a temp registry — the real ~/.xenomoon is never read.
  const inst = install("reg-install", 3800);
  writeFileSync(path.join(inst, "package.json"), JSON.stringify({ name: "xenomoon" }));
  const reg = path.join(root, "installs.json");
  writeFileSync(reg, JSON.stringify({ installs: { [inst]: null } }));
  const mod = fileURLToPath(new URL("./port-pick.js", import.meta.url));
  const out = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const m = await import(${JSON.stringify(mod)});` +
        `console.log(JSON.stringify(m.otherInstallPorts(${JSON.stringify(path.join(root, "elsewhere"))})));`,
    ],
    { env: { ...process.env, XENOMOON_REGISTRY: reg }, encoding: "utf8" },
  );
  assert.deepEqual(JSON.parse(out), [3800]);
});

/** Install I of #65: root port 4000, project a on 3118 and project broken on a string port. */
const brokenInstall = {
  port: 4000,
  projects: { a: { dir: "/a", port: 3118 }, broken: { dir: "/b", port: "oops" } },
};

test("#65: an invalid sibling entry does not release the valid entry's port", () => {
  const { installs, deps } = fakeFs({ "/i/broken": brokenInstall });
  assert.deepEqual([...claimedPorts(installs, deps)].sort(), [3118, 4000]);
});

test("#65: an install whose project list is invalid is reported with its file and reason", () => {
  const { installs, deps } = fakeFs({ "/i/broken": brokenInstall, "/i/ok": { port: 4100 } });
  assert.deepEqual(portClaims(installs, deps).problems, [
    {
      install: path.resolve("/i/broken"),
      file: path.join(path.resolve("/i/broken"), ".xenomoon.json"),
      reason: 'projects["broken"].port is not a positive integer',
    },
  ]);
});

test("#65: a registered install with no .xenomoon.json is not a problem", () => {
  const { deps } = fakeFs({});
  const exists = () => true;
  assert.deepEqual(portClaims({ "/i/fresh": null }, { ...deps, exists }), {
    ports: [DEFAULT_PORT],
    problems: [],
  });
  assert.equal(allocationRefusal("/i/fresh", {}, { ...deps, exists }), null);
});

test("#65: allocating a new port is refused while another install's file is invalid", () => {
  const { installs, deps } = fakeFs({ "/i/broken": brokenInstall, "/i/self": { port: 4200 } });
  const why = allocationRefusal("/i/self", installs, deps) ?? "";
  assert.match(why, /cannot pick a port/);
  assert.ok(why.includes(path.join(path.resolve("/i/broken"), ".xenomoon.json")), why);
  assert.equal(allocationRefusal("/i/self", { "/i/self": null }, deps), null);
});

process.on("exit", () => {
  rmSync(root, { recursive: true, force: true });
});
