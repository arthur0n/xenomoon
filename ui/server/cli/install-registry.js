// The machine's index of framework installs — the one piece of state that CANNOT be repo-local.
//
// npm exposes a SINGLE global `xenomoon` bin, and every install `npm link`s the same package name,
// so the newest `xenomoon install` silently takes the name from every earlier one. A conflict that
// lives in a machine-global namespace cannot be arbitrated by state inside any one install: from
// `~/ws/alpha` there is nothing in the filesystem that says which install drives it. This registry
// is that missing map, so the global bin degrades to a pure dispatcher and "who linked last" stops
// deciding anything.
//
// It is a CACHE, never truth: every read re-validates each install directory and prunes the ones
// that are gone, so a deleted or moved install self-heals instead of rotting. A missing or
// unwritable registry (CI, read-only home, a pre-registry install) is not an error — resolution
// degrades to cwd + the caller's fallback. Nothing here ever blocks a verb from running.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseJSON } from "../../lib/json.js";

/** Registry location. XENOMOON_REGISTRY overrides it so tests and CI never touch a real home. */
export const REGISTRY_FILE =
  process.env.XENOMOON_REGISTRY ?? path.join(homedir(), ".xenomoon", "installs.json");

/** This package's name in package.json — the marker that a directory IS an install.
 * It matches the `xenomoon` bin on purpose: npm resolves `npx github:arthur0n/xenomoon` by
 * looking for the bin named after the package, and a package with several bins and no such
 * match cannot be executed at all. */
const PKG_NAME = "xenomoon";

/** The pre-rename name. Installs created before it still carry it, and they are still
 * installs — dropping it would strand every existing one from findInstallRoot, which is what
 * server ownership and `xenomoon <verb>` targeting both walk. Delete once none remain. */
const LEGACY_PKG_NAME = "xenomoon-forge";

/** Whether `dir` is a framework install (its package.json names this package).
 * @param {string} dir @returns {boolean} */
export function isInstallDir(dir) {
  try {
    const pkg = path.join(dir, "package.json");
    if (!existsSync(pkg)) return false;
    const meta = /** @type {{ name?: string }} */ (parseJSON(readFileSync(pkg, "utf8")));
    return meta.name === PKG_NAME || meta.name === LEGACY_PKG_NAME;
  } catch {
    return false;
  }
}

/** Nearest ancestor of `from` that is an install, or null when outside one.
 * @param {string} from @returns {string|null} */
export function findInstallRoot(from) {
  for (let dir = path.resolve(from); ; ) {
    if (isInstallDir(dir)) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** True when `child` is `parent` or sits underneath it. Compares resolved paths segment-wise so
 * `/ws/alpha-xm` is NOT treated as living inside `/ws/alpha`.
 * @param {string} parent @param {string} child @returns {boolean} */
function contains(parent, child) {
  const p = path.resolve(parent);
  const c = path.resolve(child);
  return c === p || c.startsWith(p + path.sep);
}

/** The registry as { installDir: projectDir|null }, with vanished installs pruned. Any read
 * problem yields {} — an unreadable registry must never break a verb.
 * @returns {Record<string, string|null>} */
export function readRegistry() {
  /** @type {Record<string, string|null>} */
  let raw;
  try {
    const data = /** @type {{ installs?: Record<string, string|null> }} */ (
      parseJSON(readFileSync(REGISTRY_FILE, "utf8"))
    );
    raw = data.installs ?? {};
  } catch {
    return {};
  }
  /** @type {Record<string, string|null>} */
  const live = {};
  for (const [install, project] of Object.entries(raw)) {
    if (isInstallDir(install)) live[install] = project;
  }
  // Self-heal: rewrite only when entries actually disappeared, so reads stay side-effect-free
  // in the common case and a read-only home never turns into a visible failure.
  if (Object.keys(live).length !== Object.keys(raw).length) writeRegistry(live);
  return live;
}

/** Persist the map (best-effort — a read-only home is a silent no-op).
 * @param {Record<string, string|null>} installs */
function writeRegistry(installs) {
  try {
    mkdirSync(path.dirname(REGISTRY_FILE), { recursive: true });
    writeFileSync(REGISTRY_FILE, JSON.stringify({ version: 1, installs }, null, 2) + "\n");
  } catch {
    /* unwritable home — resolution still works from cwd */
  }
}

/** Record (or refresh) an install → project binding. Called wherever the binding is established,
 * so both `xenomoon install` and a direct `npm run install-project` register.
 * @param {string} installDir @param {string|null} [projectDir] */
export function registerInstall(installDir, projectDir = null) {
  const install = path.resolve(installDir);
  if (!isInstallDir(install)) return;
  const installs = readRegistry();
  installs[install] = projectDir ? path.resolve(projectDir) : (installs[install] ?? null);
  writeRegistry(installs);
}

/**
 * @typedef {object} Resolution
 * @property {string|null} root      the install a verb should act on; null when ambiguous
 * @property {string} how            short reason, printed so resolution is never invisible
 * @property {Array<[string, string|null]>} [candidates]  install→project, when ambiguous
 */

/** Decide which install a verb acts on. Order: explicit override → the install you are standing
 * in → the registered project you are standing in → the only install on the machine → ambiguous.
 * Ambiguity is deliberately an ERROR rather than a guess: silently picking the linked install is
 * the exact bug this module exists to kill.
 * @param {string} cwd @param {string} fallbackRoot the CLI's own install (bare npx / no registry)
 * @param {string|null} [override] --install=<path> or XENOMOON_INSTALL
 * @returns {Resolution} */
export function resolveInstall(cwd, fallbackRoot, override = null) {
  if (override) {
    const root = path.resolve(override);
    if (!isInstallDir(root)) return { root: null, how: `not an install: ${root}`, candidates: [] };
    return { root, how: "explicit --install" };
  }
  const inside = findInstallRoot(cwd);
  if (inside) return { root: inside, how: "cwd is inside this install" };

  const installs = readRegistry();
  const entries = Object.entries(installs);
  // Standing in a registered project (or below it) — the deepest match wins, so nested projects
  // resolve to the most specific binding rather than an enclosing one.
  const deepest = entries
    .filter(([, project]) => project && contains(project, cwd))
    .sort((a, b) => (b[1] ?? "").length - (a[1] ?? "").length)[0];
  if (deepest) return { root: deepest[0], how: `cwd is the project of this install` };

  const only = entries.length === 1 ? entries[0] : undefined;
  if (only) return { root: only[0], how: "the only registered install" };
  // Empty registry: pre-registry installs and bare `npx github:arthur0n/xenomoon` still work.
  if (entries.length === 0) return { root: fallbackRoot, how: "linked CLI — nothing registered" };
  return { root: null, how: "ambiguous", candidates: entries };
}
