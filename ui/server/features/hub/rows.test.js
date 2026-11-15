import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
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

const FILE_A = "/tmp/install-a/.xenomoon.json";
const FILE_B = "/tmp/install-b/.xenomoon.json";

/** @param {Record<string, unknown>} data @returns {string} */
const installText = (data) => JSON.stringify(data);

/** Two installs in the order the registry does not sort them, with entries out of name order. */
const twoInstalls = [
  { install: "/tmp/install-b", name: "gamma", dir: "/tmp/project-c", port: 4003 },
  { install: "/tmp/install-a", name: "beta", dir: "/tmp/project-b", port: 4002, domain: "beta" },
  { install: "/tmp/install-a", name: "alpha", dir: "/tmp/project-a", port: null },
];

test("one row per project, sorted by install then name, with every field set and no kind", () => {
  const rows = buildRows(twoInstalls).map(({ id: _id, ...rest }) => rest);
  assert.deepEqual(rows, [
    {
      install: "/tmp/install-a",
      name: "alpha",
      project: "/tmp/project-a",
      port: null,
      domain: null,
    },
    {
      install: "/tmp/install-a",
      name: "beta",
      project: "/tmp/project-b",
      port: 4002,
      domain: "beta",
    },
    {
      install: "/tmp/install-b",
      name: "gamma",
      project: "/tmp/project-c",
      port: 4003,
      domain: null,
    },
  ]);
});

test("ids are 16 hex chars of sha256(install NUL name), so one name in two installs gives two ids", () => {
  const rows = buildRows([
    { install: "/tmp/install-a", name: "alpha", dir: "/tmp/p", port: 1 },
    { install: "/tmp/install-b", name: "alpha", dir: "/tmp/p", port: 1 },
  ]);
  for (const row of rows) assert.match(row.id, /^[0-9a-f]{16}$/);
  assert.deepEqual(
    rows.map((r) => r.id),
    [hash16("/tmp/install-a\0alpha"), hash16("/tmp/install-b\0alpha")],
  );
});

test("the same input gives the same ids on every build", () => {
  const first = buildRows(twoInstalls).map((r) => r.id);
  assert.deepEqual(
    buildRows(structuredClone(twoInstalls)).map((r) => r.id),
    first,
  );
  assert.equal(new Set(first).size, 3);
});

test("no row stands for the install: the registry value, root projectDir and root port are ignored", () => {
  const files = new Map([
    [REGISTRY, registryText({ "/tmp/install-a": "/tmp/project-old" })],
    [
      FILE_A,
      installText({
        port: 4100,
        projectDir: "/tmp/project-old",
        projects: { alpha: { dir: "/tmp/project-a", port: 4001, domain: "webapp" } },
      }),
    ],
  ]);
  const { rows, errors } = loaderOver(files).load();
  assert.deepEqual(errors, []);
  assert.deepEqual(
    rows.map(({ id: _id, ...rest }) => rest),
    [
      {
        install: "/tmp/install-a",
        name: "alpha",
        project: "/tmp/project-a",
        port: 4001,
        domain: "webapp",
      },
    ],
  );
});

test("a project entry without a domain takes the install's installed domain", () => {
  const files = new Map([
    [REGISTRY, registryText({ "/tmp/install-a": null })],
    [
      FILE_A,
      installText({
        domain: "webapp",
        domainDescriptor: { name: "webapp" },
        projects: {
          alpha: { dir: "/tmp/project-a", port: 4001 },
          beta: { dir: "/tmp/project-b", port: 4002, domain: "other" },
        },
      }),
    ],
  ]);
  const { rows, errors } = loaderOver(files).load();
  assert.deepEqual(errors, []);
  assert.deepEqual(
    rows.map((r) => [r.name, r.domain]),
    [
      ["alpha", "webapp"],
      ["beta", "other"],
    ],
  );
});

test("an install with zero projects, or no install file, gives no row and no error", () => {
  const files = new Map([
    [REGISTRY, registryText({ "/tmp/install-a": "/tmp/project-a", "/tmp/install-b": null })],
    [FILE_A, installText({ port: 4100, projectDir: "/tmp/project-a" })],
  ]);
  const { fs, load } = loaderOver(files);
  assert.deepEqual(load(), { rows: [], errors: [] });
  assert.equal(fs.written.size, 0);
});

test("a project with no port gets port null, never the install's port or a sibling's", () => {
  const files = new Map([
    [REGISTRY, registryText({ "/tmp/install-a": null })],
    [
      FILE_A,
      installText({
        port: 4100,
        projects: { alpha: { dir: "/tmp/project-a" }, beta: { dir: "/tmp/project-b", port: 4002 } },
      }),
    ],
  ]);
  const { rows } = loaderOver(files).load();
  assert.deepEqual(
    rows.map((r) => [r.name, r.port]),
    [
      ["alpha", null],
      ["beta", 4002],
    ],
  );
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
  const files = new Map([
    [REGISTRY, registryText({ "/tmp/install-a": null })],
    [FILE_A, installText({ projects: { alpha: { dir: "/tmp/project-a", port: 4001 } } })],
  ]);
  const { fs, load } = loaderOver(files);
  const good = load();
  files.set(REGISTRY, JSON.stringify({ version: 2, installs: {} }));
  const bad = load();
  assert.equal(good.rows.length, 1);
  assert.deepEqual(
    bad.rows.map(({ stale, ...rest }) => (assert.ok(stale), rest)),
    good.rows,
  );
  assert.match(onlyError(bad.errors).reason, /version is missing or not 1/);
  assert.equal(
    fs.written.get(`${SIDECARS}/${hash16(REGISTRY)}.error`),
    `${AT} ${REGISTRY}: version is missing or not 1\n`,
  );
});

test("an invalid install file gives no rows for it, keeps the other install's rows and records an error", () => {
  const files = new Map([
    [REGISTRY, registryText({ "/tmp/install-a": null, "/tmp/install-b": null })],
    [FILE_A, installText({ projects: { alpha: { dir: "" } } })],
    [FILE_B, installText({ projects: { gamma: { dir: "/tmp/project-c", port: 4003 } } })],
  ]);
  const { fs, load } = loaderOver(files);
  const { rows, errors } = load();
  const err = onlyError(errors);
  assert.deepEqual(
    rows.map((r) => [r.install, r.name]),
    [["/tmp/install-b", "gamma"]],
  );
  assert.equal(err.file, FILE_A);
  assert.match(err.reason, /projects\["alpha"\]\.dir is missing/);
  assert.equal(
    fs.written.get(`${SIDECARS}/${hash16(FILE_A)}.error`),
    `${AT} ${FILE_A}: ${err.reason}\n`,
  );
});

test("a corrupt install file after a good read keeps its project rows, ports and domains", () => {
  const files = new Map([
    [REGISTRY, registryText({ "/tmp/install-a": null })],
    [
      FILE_A,
      installText({
        projects: {
          alpha: { dir: "/tmp/project-a" },
          beta: { dir: "/tmp/b", port: 4002, domain: "x" },
        },
      }),
    ],
  ]);
  const { load } = loaderOver(files);
  const good = load();
  files.set(FILE_A, "{ corrupt");
  const bad = load();
  /** @param {import("./rows.js").HubRow[]} rows */
  const shape = (rows) => rows.map((r) => [r.name, r.project, r.port, r.domain]);
  assert.deepEqual(shape(good.rows), [
    ["alpha", "/tmp/project-a", null, null],
    ["beta", "/tmp/b", 4002, "x"],
  ]);
  assert.deepEqual(
    bad.rows.map(({ stale, ...rest }) => (assert.ok(stale), rest)),
    good.rows,
  );
  assert.match(onlyError(bad.errors).reason, /invalid JSON/);
});

test("a registry entry that is not an install is dropped and nothing is written", () => {
  const files = new Map([
    [REGISTRY, registryText({ "/tmp/install-a": null, "/tmp/project-b": null })],
    [FILE_A, installText({ projects: { alpha: { dir: "/tmp/project-a" } } })],
    ["/tmp/project-b/.xenomoon.json", installText({ projects: { x: { dir: "/tmp/x" } } })],
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

/** A then B both good, then A breaks: project a loses its port and b gets a string port. */
function staleLoad() {
  const files = new Map([
    [REGISTRY, registryText({ "/tmp/install-a": null, "/tmp/install-b": null })],
    [
      FILE_A,
      installText({
        projects: { a: { dir: "/tmp/project-a", port: 4001 }, b: { dir: "/tmp/b", port: 4002 } },
      }),
    ],
    [FILE_B, installText({ projects: { gamma: { dir: "/tmp/project-c", port: 4003 } } })],
  ]);
  const { load } = loaderOver(files);
  const good = load();
  const goodA = installText({
    projects: { a: { dir: "/tmp/project-a" }, b: { dir: "/tmp/b", port: 4002 } },
  });
  files.set(
    FILE_A,
    installText({ projects: { a: { dir: "/tmp/project-a" }, b: { dir: "/tmp/b", port: "x" } } }),
  );
  return { files, load, good, bad: load(), goodA };
}

test("rows served from the last good install file carry stale with that file and its reason", () => {
  const { bad } = staleLoad();
  const reason = onlyError(bad.errors).reason;
  assert.deepEqual(
    bad.rows.map((r) => [r.name, r.port, r.stale]),
    [
      ["a", 4001, { file: FILE_A, reason }],
      ["b", 4002, { file: FILE_A, reason }],
      ["gamma", 4003, undefined],
    ],
  );
});

test("a good read has no stale field on any row, and stale rows are otherwise the cached ones", () => {
  const { good, bad } = staleLoad();
  for (const r of good.rows) assert.equal("stale" in r, false);
  assert.deepEqual(
    bad.rows.map(({ stale: _s, ...rest }) => rest),
    good.rows,
  );
});

test("stale clears once the install file is valid again, with the current ports", () => {
  const { files, load, goodA } = staleLoad();
  files.set(FILE_A, goodA);
  const { rows, errors } = load();
  assert.deepEqual(errors, []);
  assert.deepEqual(
    rows.map((r) => [r.name, r.port, "stale" in r]),
    [
      ["a", null, false],
      ["b", 4002, false],
      ["gamma", 4003, false],
    ],
  );
});

test("a failed registry read marks every cached row stale with the registry file", () => {
  const { files, load } = staleLoad();
  files.set(FILE_A, installText({ projects: { a: { dir: "/tmp/project-a", port: 4001 } } }));
  files.set(REGISTRY, "{ not json");
  const { rows } = load();
  assert.deepEqual(
    rows.map((r) => [r.name, r.stale]),
    [
      ["a", { file: REGISTRY, reason: "invalid JSON" }],
      ["gamma", { file: REGISTRY, reason: "invalid JSON" }],
    ],
  );
});
