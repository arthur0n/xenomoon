// One project's entry in the install's `projects` map (#65): `npm run install-project` adds
// every project of an install through it, the first one and the later ones. The decisions
// (is the domain already installed, may this name / port be used, is the folder already
// listed) are pure and take their inputs; the two file helpers below them are the only I/O.
// A BOOTSTRAP helper like setup.js and profiles.js: it never imports config.js.
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../lib/json.js";
import { updateInstallConfig } from "../../lib/install-config.js";
import { canonicalPath } from "./validate-path.js";
import { DEFAULT_PORT, allocationRefusal, claimedPorts } from "./port-pick.js";
import { readRegistry } from "./install-registry.js";
import { MAX_PORT, isPort } from "./profiles.js";

/** @typedef {import("./profiles.js").Profile} Profile */

/** The domain this install already has installed, or null on a fresh install. The durable
 * evidence is the pair new.js leaves behind: the descriptor baked by installCapabilities
 * (`domainDescriptor`) and the domain name written in step 2b (`domain`). Either one alone is
 * a run that stopped half-way, which is treated as fresh so the next run completes it.
 * @param {Record<string, unknown>} cfg @returns {string | null} */
export function installedDomain(cfg) {
  const baked = typeof cfg.domainDescriptor === "object" && cfg.domainDescriptor !== null;
  return baked && typeof cfg.domain === "string" && cfg.domain ? cfg.domain : null;
}

/** Why a later project may not use `requested` (already canonical), or null when it may.
 * @param {string} installed @param {string | null} requested @returns {string | null} */
export function domainRefusal(installed, requested) {
  if (!requested || requested === installed) return null;
  return (
    `this install has the "${installed}" domain installed; a "${requested}" project needs ` +
    `the "${requested}" domain's own install (one framework install per domain).`
  );
}

/** The map entry whose dir is the folder `dir`, or null. Both sides are compared as REAL
 * locations (./validate-path.js canonicalPath; a relative entry resolves against the install),
 * so an alias of a listed folder, or an entry written before dirs were stored canonical, matches.
 * @param {Record<string, Profile>} projects @param {string} dir @param {string} installDir
 * @returns {{ name: string, entry: Profile } | null} */
export function entryForDir(projects, dir, installDir) {
  const want = canonicalPath(dir);
  for (const [name, entry] of Object.entries(projects)) {
    if (canonicalPath(entry.dir, installDir) === want) return { name, entry };
  }
  return null;
}

/** Why `name` may not be given to the project at `dir`, or null when it may: a name already
 * used by a DIFFERENT folder is refused, naming that folder.
 * @param {Record<string, Profile>} projects @param {string} name @param {string} dir
 * @param {string} installDir @returns {string | null} */
export function nameRefusal(projects, name, dir, installDir) {
  if (!name) return "a project name must not be empty.";
  const taken = projects[name];
  if (!taken) return null;
  const other = path.resolve(installDir, taken.dir);
  if (canonicalPath(other) === canonicalPath(dir)) return null;
  return `the project name "${name}" is already used by ${other}; pass --name=<another>.`;
}

/** Why a NEW project may not take `port`, or null when it may. `claimed` is every port the
 * installs and their projects claim; `ownPort` is a port this very project already serves on
 * (the root port of the install's root projectDir), which it may keep.
 * @param {number} port @param {number[]} claimed @param {number | null} [ownPort]
 * @returns {string | null} */
export function portRefusal(port, claimed, ownPort = null) {
  if (!isPort(port)) return `port must be an integer from 1 to ${MAX_PORT} (got ${String(port)}).`;
  if (port === ownPort || !claimed.includes(port)) return null;
  return `port ${port} is already claimed by another install or project; pick another (--port=<n>).`;
}

/** Every port claimed on this machine by something OTHER than the project `ownName` of the
 * install at `installDir` (whose config is `cfg`): every other registered install (root port and
 * projects, ./port-pick.js claimedPorts), every other entry of this install's `projects` map, and
 * — when `includeRoot` — this install's own root port (absent = the default it would use). The
 * root is left out on a first run (this project takes the root port) and for the root project
 * of a pre-map install. The one rule for first and later runs, at validation and at commit.
 * @param {string} installDir @param {Record<string, unknown>} cfg
 * @param {{ ownName: string | null, includeRoot: boolean, registry?: Record<string, unknown> }} opts
 * @returns {number[]} */
export function portsClaimedByOthers(installDir, cfg, { ownName, includeRoot, registry }) {
  const self = canonicalPath(installDir);
  const others = Object.entries(registry ?? readRegistry()).filter(
    ([dir]) => canonicalPath(dir) !== self,
  );
  const map = /** @type {Record<string, { port?: unknown } | null>} */ (
    typeof cfg.projects === "object" && cfg.projects !== null ? cfg.projects : {}
  );
  const mine = Object.entries(map).flatMap(([name, p]) => {
    const port = p?.port;
    return name !== ownName && typeof port === "number" ? [port] : [];
  });
  const root = typeof cfg.port === "number" ? cfg.port : DEFAULT_PORT;
  return [...claimedPorts(Object.fromEntries(others)), ...mine, ...(includeRoot ? [root] : [])];
}

/** The one command that adds a project to an install. The old single-project writers
 * (setup.js with a path, start-profile.js --add) refuse and name it.
 * @param {string} [dir] @returns {string} */
export function addProjectCommand(dir = "<dir>") {
  return `npm run install-project -- ${dir}`;
}

/** `<installDir>/.xenomoon.json` as an object, or {} when absent or invalid.
 * @param {string} installDir @returns {Record<string, unknown>} */
export function readInstallConfig(installDir) {
  try {
    const cfg = parseJSON(readFileSync(path.join(installDir, ".xenomoon.json"), "utf8"));
    return typeof cfg === "object" && cfg !== null && !Array.isArray(cfg)
      ? /** @type {Record<string, unknown>} */ (cfg)
      : {};
  } catch {
    return {};
  }
}

/** The `projects` map of `cfg` (never null). @param {Record<string, unknown>} cfg
 * @returns {Record<string, Profile>} */
const projectsOf = (cfg) =>
  /** @type {Record<string, Profile>} */ (
    typeof cfg.projects === "object" && cfg.projects !== null ? cfg.projects : {}
  );

/** Merge a patch into `<installDir>/.xenomoon.json`, preserving every other field, through
 * ../../lib/install-config.js updateInstallConfig (a file that cannot be read writes nothing).
 * @param {string} installDir @param {Record<string, unknown>} patch
 * @returns {string | null} the reason nothing was written, or null = written */
export function mergeInstallConfig(installDir, patch) {
  const r = updateInstallConfig(installDir, (cfg) => ({ next: { ...cfg, ...patch } }));
  return "error" in r ? r.error : null;
}

/** Add one entry to the install's `projects` map, keeping every other entry and field; `patch`
 * (the first run's root domain + port) lands in the same write. Ownership is checked inside the
 * update, on the file as it is read for this write: a name another run gave to a different
 * folder, or a port another run took since validation, writes nothing and returns the refusal;
 * so does a file that cannot be read (null = written). Without a cross-process lock a window
 * remains between that read and the rename.
 * @param {string} installDir @param {string} name @param {Profile} entry
 * @param {{ includeRoot?: boolean, patch?: Record<string, unknown>,
 *   registry?: Record<string, unknown> }} [opts]
 * @returns {string | null} */
export function addProjectEntry(installDir, name, entry, opts = {}) {
  if (entry.port !== undefined && !isPort(entry.port))
    return `${portRefusal(entry.port, [])} Nothing was written.`;
  const again = "nothing was written; run the command again.";
  const r = updateInstallConfig(installDir, (cfg) => {
    const projects = projectsOf(cfg);
    if (nameRefusal(projects, name, entry.dir, installDir))
      return {
        refuse: `another run gave the project name "${name}" to another folder meanwhile; ${again}`,
      };
    const unknown = allocationRefusal(installDir, opts.registry ?? readRegistry());
    if (unknown) return { refuse: `${unknown} Nothing was written.` };
    const claimed = portsClaimedByOthers(installDir, cfg, {
      ownName: name,
      includeRoot: opts.includeRoot ?? false,
      registry: opts.registry,
    });
    if (entry.port !== undefined && claimed.includes(entry.port))
      return { refuse: `another run took port ${entry.port} meanwhile; ${again}` };
    return { next: { ...cfg, ...opts.patch, projects: { ...projects, [name]: entry } } };
  });
  return "error" in r ? r.error : null;
}

/** Remove the entry `name` from the install's `projects` map, keeping every other entry and
 * field; the map is read inside the update, so an entry another run added meanwhile stays.
 * @param {string} installDir @param {string} name
 * @returns {null | { error: string, noSuchName: boolean }} null = removed and written;
 *   `noSuchName` = the map has no such entry (nothing written); otherwise the file could not
 *   be read or written (nothing written) */
export function removeProjectEntry(installDir, name) {
  let noSuchName = false;
  const r = updateInstallConfig(installDir, (cfg) => {
    const projects = projectsOf(cfg);
    if (!name || !projects[name]) {
      noSuchName = true;
      return { refuse: `no such profile "${name}"` };
    }
    const rest = { ...projects };
    delete rest[name];
    return { next: { ...cfg, projects: rest } };
  });
  return "error" in r ? { error: r.error, noSuchName } : null;
}
