// The hub's row list: one row per project, i.e. per entry of the `projects` map of every
// registered install. There is no row for an install itself: the registry value and a root
// `projectDir` are ignored. buildRows is pure; makeRowLoader adds the file reads, keeping the last
// good install file so one bad edit never blanks the hub, and writing an `.error` sidecar per
// failing file. No HTTP, no process work, and nothing is ever written to the registry or an install file.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REGISTRY_FILE, isInstallDir, parseRegistry } from "../../cli/install-registry.js";
import { projectsOf, readProfiles } from "../../cli/profiles.js";
import { installedDomain } from "../../cli/project-entry.js";
import { parseJSON } from "../../../lib/json.js";

/** @typedef {import("../../cli/profiles.js").ProjectEntry} ProjectEntry */

/** The file whose current read failed, so the row comes from its last good copy.
 * @typedef {{ file: string, reason: string }} HubStale */

/** A project row. `project` is the project dir; `port` is null when the map gives none (the row
 * cannot be started: it never borrows the install's or another project's port). `stale` is set only
 * on a row served from the last good copy of a file whose current read failed: it shows as before
 * but cannot be started (lifecycle.js), only stopped.
 * @typedef {{
 *   id: string,
 *   install: string,
 *   name: string,
 *   project: string,
 *   port: number | null,
 *   domain: string | null,
 *   stale?: HubStale,
 * }} HubRow
 */

/** @typedef {{ file: string, reason: string, at: string, sidecar: string | null }} HubError */

/** First 16 hex chars of sha256(text): stable across runs, carries no readable path.
 * @param {string} text @returns {string} */
const shortHash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** @param {string} install @param {string} name @returns {string} */
const rowId = (install, name) => shortHash(`${install}\0${name}`);

/** @param {HubRow} a @param {HubRow} b @returns {number} */
function compareRows(a, b) {
  if (a.install !== b.install) return a.install < b.install ? -1 : 1;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return 0;
}

/** One row per project entry, sorted by install then name. Pure.
 * @param {Array<ProjectEntry & { domain?: string | null, stale?: HubStale }>} projects
 * @returns {HubRow[]} */
export function buildRows(projects) {
  return projects
    .map((p) => ({
      id: rowId(p.install, p.name),
      install: p.install,
      name: p.name,
      project: p.dir,
      port: p.port,
      domain: p.domain ?? null,
      ...(p.stale ? { stale: p.stale } : {}),
    }))
    .sort(compareRows);
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

/** The domain an install file says is installed (one install carries one domain), or null.
 * @param {string} text @returns {string | null} */
function installDomain(text) {
  try {
    return installedDomain(/** @type {Record<string, unknown>} */ (parseJSON(text)));
  } catch {
    return null;
  }
}

/** A loader whose `load()` re-reads the registry and every install's projects map.
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

  /** The parsed map on success (cached), else the last good map or {} plus an error and `stale`.
   * @template {Record<string, unknown>} T
   * @param {HubError[]} errors @param {string} file
   * @param {{ ok: true, value: T } | { ok: false, reason: string }} parsed
   * @returns {{ value: T, stale?: HubStale }} */
  function settle(errors, file, parsed) {
    if (parsed.ok) {
      lastGood.set(file, parsed.value);
      return { value: parsed.value };
    }
    record(errors, file, parsed.reason);
    return {
      value: /** @type {T} */ (lastGood.get(file) ?? {}),
      stale: { file, reason: parsed.reason },
    };
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

  /** One install's project entries with their domain, from its last good install file; `stale` is
   * the install file's own failure, else the registry's.
   * @param {HubError[]} errors @param {string} install @param {HubStale | undefined} registryStale
   * @returns {Array<ProjectEntry & { domain: string | null, stale?: HubStale }>} */
  function projectsOfInstall(errors, install, registryStale) {
    /** @type {string | null} */
    let text = null;
    const parsed = readProfiles(install, { readFile: (f) => (text = readFile(f)) });
    const result = parsed.ok
      ? {
          ok: /** @type {const} */ (true),
          value: { text: /** @type {string | null} */ (text), projects: parsed.projects },
        }
      : parsed;
    const { value: good, stale = registryStale } = settle(
      errors,
      path.join(install, ".xenomoon.json"),
      result,
    );
    const goodText = good.text;
    if (typeof goodText !== "string") return [];
    // A project entry names a domain only when it differs from the install's; else the install's.
    const ofInstall = installDomain(goodText);
    return projectsOf(install, { readFile: () => goodText }).map((entry) => ({
      ...entry,
      domain: good.projects?.[entry.name]?.domain ?? ofInstall,
      ...(stale ? { stale } : {}),
    }));
  }

  return function load() {
    /** @type {HubError[]} */
    const errors = [];
    const { value: registered, stale } = settle(errors, registryFile, parseRegistryFile());
    const installs = Object.keys(registered).filter((dir) => isInstall(dir));
    const projects = installs.flatMap((install) => projectsOfInstall(errors, install, stale));
    return { rows: buildRows(projects), errors };
  };
}
