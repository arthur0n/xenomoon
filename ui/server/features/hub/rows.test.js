import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { DEFAULT_PORT } from "../../cli/port-pick.js";
import { buildRows, makeRowLoader } from "./rows.js";

/** @typedef {import("./rows.js").HubError} HubError */

const REGISTRY = "/tmp/registry/installs.json";
const SIDECARS = "/tmp/hub-errors";
const AT = "2026-11-10T12:00:00.000Z";

/** @param {string} text @returns {string} */
const hash16 = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);
/** @param {Record<string, string | null>} installs @returns {string} */
const registryText = (installs) => JSON.stringify({ version: 1, installs });

/** The single error of a load, asserted to be the only one.
 * @param {HubError[]} errors @returns {HubError} */
function onlyError(errors) {
  assert.equal(errors.length, 1, JSON.stringify(errors));
  return /** @type {HubError} */ (errors[0]);
}

/** An in-memory filesystem: `files` is read, writes land in `written`.
 * @param {Map<string, string>} files @param {{ failWrite?: boolean }} [opts] */
function memoryFs(files, { failWrite = false } = {}) {
  /** @type {Map<string, string>} */
  const written = new Map();
  /** @type {Array<[string, unknown]>} */
  const dirs = [];
  return {
    written,
    dirs,
    /** @param {string} file @returns {string} */
    readFile(file) {
      const text = files.get(file);
      if (text === undefined) {
        throw Object.assign(new Error(`ENOENT: ${file}`), { code: "ENOENT" });
      }
      return text;
    },
    /** @param {string} file @param {string} text */
    writeFile(file, text) {
      if (failWrite) throw Object.assign(new Error("EACCES: simulated"), { code: "EACCES" });
      written.set(file, text);
    },
    /** @param {string} dir @param {unknown} opts */
    mkdir(dir, opts) {
      dirs.push([dir, opts]);
    },
  };
}

/** @param {Map<string, string>} files @param {{ failWrite?: boolean }} [opts] */
function loaderOver(files, { failWrite = false } = {}) {
  const installs = new Set(["/tmp/install-a", "/tmp/install-b"]);
  const fs = memoryFs(files, { failWrite });
  const load = makeRowLoader({
    registryFile: REGISTRY,
    readFile: fs.readFile,
    writeFile: fs.writeFile,
    mkdir: fs.mkdir,
    sidecarDir: SIDECARS,
    isInstall: (dir) => installs.has(dir),
    now: () => new Date(AT),
  });
  return { fs, load };
}

/** @param {string} dir @returns {number | null} */
const portOfA = (dir) => (dir === "/tmp/install-a" ? 4000 : null);

const twoInstalls = {
  installs: { "/tmp/install-b": null, "/tmp/install-a": "/tmp/project-a" },
  profilesByInstall: {
    "/tmp/install-a": {
      beta: { dir: "/tmp/project-b", port: 4002, domain: "beta" },
      alpha: { dir: "/tmp/project-a" },
    },
  },
  installPortOf: portOfA,
};

test("rows are sorted by install, then install before profile, then name, with every field set", () => {
  const rows = buildRows(twoInstalls).map(({ id: _id, ...rest }) => rest);
  assert.deepEqual(rows, [
    {
      kind: "install",
      install: "/tmp/install-a",
      name: "install-a",
      project: "/tmp/project-a",
      port: 4000,
      domain: null,
    },
    {
      kind: "profile",
      install: "/tmp/install-a",
      name: "alpha",
      project: "/tmp/project-a",
      port: 4000,
      domain: null,
    },
    {
      kind: "profile",
      install: "/tmp/install-a",
      name: "beta",
      project: "/tmp/project-b",
      port: 4002,
      domain: "beta",
    },
    {
      kind: "install",
      install: "/tmp/install-b",
      name: "install-b",
      project: null,
      port: DEFAULT_PORT,
      domain: null,
    },
  ]);
});

test("a profile without a port uses the install's saved port, then the default port", () => {
  const rows = buildRows({
    installs: { "/tmp/install-a": null, "/tmp/install-b": null },
    profilesByInstall: {
      "/tmp/install-a": { alpha: { dir: "/tmp/project-a" } },
      "/tmp/install-b": { beta: { dir: "/tmp/project-b" } },
    },
    installPortOf: portOfA,
  });
  /** @param {string} name */
  const port = (name) => rows.find((r) => r.kind === "profile" && r.name === name)?.port;
  assert.equal(port("alpha"), 4000);
  assert.equal(port("beta"), DEFAULT_PORT);
});

test("ids are 16 hex chars derived from kind, install and name, and differ between kinds", () => {
  const rows = buildRows(twoInstalls);
  for (const row of rows) assert.match(row.id, /^[0-9a-f]{16}$/);
  const installRow = rows.find((r) => r.kind === "install" && r.install === "/tmp/install-a");
  const profileRow = rows.find((r) => r.kind === "profile" && r.name === "alpha");
  assert.equal(installRow?.id, hash16("install\0/tmp/install-a\0install-a"));
  assert.equal(profileRow?.id, hash16("profile\0/tmp/install-a\0alpha"));
  assert.notEqual(installRow?.id, profileRow?.id);
});

test("the same input gives the same ids on every build", () => {
  const copy = {
    installs: structuredClone(twoInstalls.installs),
    profilesByInstall: structuredClone(twoInstalls.profilesByInstall),
    installPortOf: portOfA,
  };
  const first = buildRows(twoInstalls).map((r) => r.id);
  assert.deepEqual(
    buildRows(copy).map((r) => r.id),
    first,
  );
  assert.equal(new Set(first).size, 4);
});

test("a missing registry file gives no rows and no errors", () => {
  const { fs, load } = loaderOver(new Map());
  assert.deepEqual(load(), { rows: [], errors: [] });
  assert.equal(fs.written.size, 0);
});

test("an invalid registry on the first read gives no rows, one error and a sidecar named by the file hash", () => {
  const { fs, load } = loaderOver(new Map([[REGISTRY, "{ not json"]]));
  const { rows, errors } = load();
  const sidecar = `${SIDECARS}/${hash16(REGISTRY)}.error`;
  const err = onlyError(errors);
  assert.deepEqual(rows, []);
  assert.equal(err.file, REGISTRY);
  assert.match(err.reason, /invalid JSON/);
  assert.equal(err.at, AT);
  assert.equal(err.sidecar, sidecar);
  assert.deepEqual(fs.dirs, [[SIDECARS, { recursive: true }]]);
  assert.equal(fs.written.get(sidecar), `${AT} ${REGISTRY}: invalid JSON\n`);
});

test("an invalid registry after a good read keeps the previous rows and records the error", () => {
  const files = new Map([[REGISTRY, registryText({ "/tmp/install-a": "/tmp/project-a" })]]);
  const { fs, load } = loaderOver(files);
  const good = load();
  files.set(REGISTRY, JSON.stringify({ version: 2, installs: {} }));
  const bad = load();
  assert.equal(good.rows.length, 1);
  assert.deepEqual(bad.rows, good.rows);
  assert.match(onlyError(bad.errors).reason, /version is missing or not 1/);
  assert.equal(
    fs.written.get(`${SIDECARS}/${hash16(REGISTRY)}.error`),
    `${AT} ${REGISTRY}: version is missing or not 1\n`,
  );
});

test("a bad profile file keeps the install row and records an error keyed by that file", () => {
  const profileFile = "/tmp/install-a/.xenomoon.json";
  const files = new Map([
    [REGISTRY, registryText({ "/tmp/install-a": "/tmp/project-a" })],
    [profileFile, JSON.stringify({ projects: { alpha: { dir: "" } } })],
  ]);
  const { fs, load } = loaderOver(files);
  const { rows, errors } = load();
  const err = onlyError(errors);
  assert.deepEqual(
    rows.map((r) => [r.kind, r.name]),
    [["install", "install-a"]],
  );
  assert.equal(err.file, profileFile);
  assert.match(err.reason, /projects\["alpha"\]\.dir is missing/);
  assert.equal(
    fs.written.get(`${SIDECARS}/${hash16(profileFile)}.error`),
    `${AT} ${profileFile}: ${err.reason}\n`,
  );
});

test("a corrupt profile file after a good read keeps both its profile rows and the install's port", () => {
  const profileFile = "/tmp/install-a/.xenomoon.json";
  const files = new Map([
    [REGISTRY, registryText({ "/tmp/install-a": "/tmp/project-a" })],
    [profileFile, JSON.stringify({ port: 4100, projects: { alpha: { dir: "/tmp/project-a" } } })],
  ]);
  const { load } = loaderOver(files);
  const good = load();
  files.set(profileFile, "{ corrupt");
  const bad = load();
  /** @param {import("./rows.js").HubRow[]} rows */
  const shape = (rows) => rows.map((r) => [r.kind, r.name, r.port]);
  assert.deepEqual(shape(good.rows), [
    ["install", "install-a", 4100],
    ["profile", "alpha", 4100],
  ]);
  assert.deepEqual(shape(bad.rows), shape(good.rows));
  assert.match(onlyError(bad.errors).reason, /invalid JSON/);
});

test("a registry entry that is not an install is dropped and nothing is written", () => {
  const files = new Map([
    [REGISTRY, registryText({ "/tmp/install-a": null, "/tmp/project-b": null })],
  ]);
  const { fs, load } = loaderOver(files);
  const { rows, errors } = load();
  assert.deepEqual(
    rows.map((r) => r.install),
    ["/tmp/install-a"],
  );
  assert.deepEqual(errors, []);
  assert.equal(fs.written.size, 0);
});

test("a sidecar write that throws leaves the error with a null sidecar and does not throw", () => {
  const { load } = loaderOver(new Map([[REGISTRY, "[]"]]), { failWrite: true });
  const { rows, errors } = load();
  const err = onlyError(errors);
  assert.deepEqual(rows, []);
  assert.match(err.reason, /root is not an object/);
  assert.equal(err.sidecar, null);
});
