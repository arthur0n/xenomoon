// The hub's row list: one row per client project, i.e. each registered install and each of its
// launch profiles. buildRows is pure; makeRowLoader adds the file reads, keeping the last good
// parse per file (an install's profiles and its root port together, from the one .xenomoon.json) so one bad edit never blanks the hub, and writing an `.error` sidecar per failing
// file. No HTTP, no process work, and nothing is ever written to the registry or a profile file.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REGISTRY_FILE, isInstallDir, parseRegistry } from "../../cli/install-registry.js";
import { readProfiles } from "../../cli/profiles.js";
import { DEFAULT_PORT } from "../../cli/port-pick.js";

/** @typedef {import("../../cli/profiles.js").Profile} Profile */

/**
 * @typedef {{
 *   id: string,
 *   kind: "install" | "profile",
 *   install: string,
 *   name: string,
 *   project: string | null,
 *   port: number,
 *   domain: string | null,
 * }} HubRow
 */

/** @typedef {{ file: string, reason: string, at: string, sidecar: string | null }} HubError */

/** First 16 hex chars of sha256(text): stable across runs, carries no readable path.
 * @param {string} text @returns {string} */
const shortHash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** @param {HubRow["kind"]} kind @param {string} install @param {string} name @returns {string} */
const rowId = (kind, install, name) => shortHash(`${kind}\0${install}\0${name}`);

/** @param {HubRow} a @param {HubRow} b @returns {number} */
function compareRows(a, b) {
  if (a.install !== b.install) return a.install < b.install ? -1 : 1;
  if (a.kind !== b.kind) return a.kind === "install" ? -1 : 1;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return 0;
}

/** One install row plus one row per profile of every install. Pure.
 * @param {{
 *   installs: Record<string, string | null>,
 *   profilesByInstall: Record<string, Record<string, Profile>>,
 *   installPortOf: (installDir: string) => number | null,
 * }} input
 * @returns {HubRow[]} */
export function buildRows({ installs, profilesByInstall, installPortOf }) {
  /** @type {HubRow[]} */
  const rows = [];
  for (const [install, project] of Object.entries(installs)) {
    const installPort = installPortOf(install) ?? DEFAULT_PORT;
    const name = path.basename(install);
    rows.push({
      id: rowId("install", install, name),
      kind: "install",
      install,
      name,
      project,
      port: installPort,
      domain: null,
    });
    for (const [profileName, profile] of Object.entries(profilesByInstall[install] ?? {})) {
      rows.push({
        id: rowId("profile", install, profileName),
        kind: "profile",
        install,
        name: profileName,
        project: profile.dir,
        port: profile.port ?? installPort,
        domain: profile.domain ?? null,
      });
    }
  }
  return rows.sort(compareRows);
}

/**
 * @typedef {{
 *   registryFile?: string,
 *   readFile?: (file: string) => string,
 *   writeFile?: (file: string, text: string) => void,
 *   mkdir?: (dir: string, opts: { recursive: true }) => unknown,
 *   sidecarDir: string,
 *   isInstall?: (dir: string) => boolean,
 *   now?: () => Date,
 * }} RowLoaderOptions
 */

/** Read errors other than a missing file become an `ok:false`, like readProfiles does.
 * @param {unknown} err @returns {string} */
function readFailure(err) {
  const e = /** @type {{ code?: unknown, message?: unknown }} */ (err);
  return String(e?.code ?? e?.message ?? err);
}

/** A loader whose `load()` re-reads the registry and every install's profiles.
 * @param {RowLoaderOptions} options
 * @returns {() => { rows: HubRow[], errors: HubError[] }} */
export function makeRowLoader({
  registryFile = REGISTRY_FILE,
  readFile = (f) => readFileSync(f, "utf8"),
  writeFile = (f, text) => {
    writeFileSync(f, text);
  },
  mkdir = (d, opts) => mkdirSync(d, opts),
  sidecarDir,
  isInstall = isInstallDir,
  now = () => new Date(),
}) {
  /** Last good parse per file path. @type {Map<string, Record<string, unknown>>} */
  const lastGood = new Map();

  /** @param {HubError[]} errors @param {string} file @param {string} reason */
  function record(errors, file, reason) {
    const at = now().toISOString();
    /** @type {string | null} */
    let sidecar = path.join(sidecarDir, `${shortHash(file)}.error`);
    try {
      mkdir(sidecarDir, { recursive: true });
      writeFile(sidecar, `${at} ${file}: ${reason}\n`);
    } catch {
      sidecar = null;
    }
    errors.push({ file, reason, at, sidecar });
  }

  /** The parsed map on success (cached), else the last good map or {} plus an error.
   * @template {Record<string, unknown>} T
   * @param {HubError[]} errors @param {string} file
   * @param {{ ok: true, value: T } | { ok: false, reason: string }} parsed @returns {T} */
  function settle(errors, file, parsed) {
    if (parsed.ok) {
      lastGood.set(file, parsed.value);
      return parsed.value;
    }
    record(errors, file, parsed.reason);
    return /** @type {T} */ (lastGood.get(file) ?? {});
  }

  /** @returns {{ ok: true, value: Record<string, string | null> } | { ok: false, reason: string }} */
  function parseRegistryFile() {
    /** @type {string} */
    let text;
    try {
      text = readFile(registryFile);
    } catch (err) {
      const code = /** @type {{ code?: unknown }} */ (err)?.code;
      if (code === "ENOENT") return { ok: true, value: {} };
      return { ok: false, reason: readFailure(err) };
    }
    const parsed = parseRegistry(text);
    return parsed.ok ? { ok: true, value: parsed.installs } : parsed;
  }

  return function load() {
    /** @type {HubError[]} */
    const errors = [];
    const registered = settle(errors, registryFile, parseRegistryFile());
    /** @type {Record<string, string | null>} */
    const installs = {};
    for (const [dir, project] of Object.entries(registered)) {
      if (isInstall(dir)) installs[dir] = project;
    }
    /** @type {Record<string, Record<string, Profile>>} */
    const profilesByInstall = {};
    /** @type {Map<string, number | null>} */
    const portByInstall = new Map();
    for (const install of Object.keys(installs)) {
      const parsed = readProfiles(install, { readFile });
      const result = parsed.ok
        ? {
            ok: /** @type {const} */ (true),
            value: { projects: parsed.projects, port: parsed.port },
          }
        : parsed;
      const good = settle(errors, path.join(install, ".xenomoon.json"), result);
      profilesByInstall[install] = good.projects ?? {};
      portByInstall.set(install, good.port ?? null);
    }
    const installPortOf = (/** @type {string} */ dir) => portByInstall.get(dir) ?? null;
    return { rows: buildRows({ installs, profilesByInstall, installPortOf }), errors };
  };
}
