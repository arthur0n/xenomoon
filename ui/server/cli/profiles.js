// Named per-project launch profiles: the `projects` map inside the install's .xenomoon.json.
// A BOOTSTRAP helper like start-profile.js: it never imports config.js, only reads the file.
// parseProfiles is pure and total (a bad shape is an `ok:false` with a one-line reason naming
// the field, mirroring parseRegistry); readProfiles adds the file read, with readFile injectable.
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../lib/json.js";

/** @typedef {{ dir: string, port?: number, domain?: string }} Profile */

/** True when `child` is `parent` or sits underneath it. Compares resolved paths segment-wise so
 * `/ws/alpha-xm` is NOT treated as living inside `/ws/alpha`. It lives here, not in
 * install-registry.js, because install-registry imports this module for project resolution.
 * @param {string} parent @param {string} child @returns {boolean} */
export function contains(parent, child) {
  const p = path.resolve(parent);
  const c = path.resolve(child);
  return c === p || c.startsWith(p + path.sep);
}

/**
 * @typedef {{ ok: true, projects: Record<string, Profile>, port: number | null, projectDir: string | null }
 *   | { ok: false, reason: string }} ProfilesParse
 */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
/** @param {unknown} v @returns {v is string} */
const isDir = (v) => typeof v === "string" && v !== "";
/** The highest TCP port number. */
export const MAX_PORT = 65535;
/** THE port rule (#65), for every project port accepted or validated (install file, --port,
 * the commit-time check in ./project-entry.js, an inherited PORT): an integer from 1 to 65535.
 * @param {unknown} v @returns {v is number} */
export const isPort = (v) =>
  Number.isInteger(v) && /** @type {number} */ (v) >= 1 && /** @type {number} */ (v) <= MAX_PORT;
/** @param {string} f */
const readUtf8 = (f) => readFileSync(f, "utf8");

/** Why one profile entry is invalid, or null when it is a valid Profile.
 * @param {string} name @param {unknown} p @returns {string | null} */
function profileProblem(name, p) {
  const at = `projects["${name}"]`;
  if (!isObject(p)) return `${at} is not an object`;
  if (!isDir(p.dir)) return `${at}.dir is missing or not a string`;
  if (p.port !== undefined && !isPort(p.port)) {
    const high = Number.isInteger(p.port) && /** @type {number} */ (p.port) > MAX_PORT;
    return `${at}.port ${high ? `is above ${MAX_PORT}` : "is not a positive integer"}`;
  }
  if (p.domain !== undefined && (typeof p.domain !== "string" || !p.domain)) {
    return `${at}.domain is not a non-empty string`;
  }
  return null;
}

/** Validate .xenomoon.json text; only the `projects` map and the root `projectDir` are checked.
 * The root `port` is carried through when it is a positive integer, else null. The root
 * `projectDir` (which only an old install still carries; read, never written) is a non-empty string or absent
 * (null); any other value is refused. Other root fields are ignored.
 * @param {string} text @returns {ProfilesParse} */
export function parseProfiles(text) {
  /** @type {unknown} */
  let data;
  try {
    data = parseJSON(text);
  } catch {
    return { ok: false, reason: "invalid JSON" };
  }
  if (!isObject(data)) return { ok: false, reason: "root is not an object" };
  const { projects } = data;
  const port = isPort(data.port) ? data.port : null;
  if (data.projectDir !== undefined && !isDir(data.projectDir)) {
    return { ok: false, reason: "projectDir is not a non-empty string" };
  }
  const projectDir = /** @type {string | undefined} */ (data.projectDir) ?? null;
  if (projects === undefined) return { ok: true, projects: {}, port, projectDir };
  if (!isObject(projects)) return { ok: false, reason: "projects is not an object" };
  for (const [name, p] of Object.entries(projects)) {
    const problem = profileProblem(name, p);
    if (problem) return { ok: false, reason: problem };
  }
  return {
    ok: true,
    projects: /** @type {Record<string, Profile>} */ (projects),
    port,
    projectDir,
  };
}

/** Read and validate `<installDir>/.xenomoon.json`. A missing file is an empty map, no port and
 * no projectDir.
 * @param {string} installDir
 * @param {{ readFile?: (file: string) => string }} [deps]
 * @returns {ProfilesParse} */
export function readProfiles(installDir, { readFile = readUtf8 } = {}) {
  /** @type {string} */
  let text;
  try {
    text = readFile(path.join(installDir, ".xenomoon.json"));
  } catch (err) {
    const e = /** @type {{ code?: unknown, message?: unknown }} */ (err);
    if (e?.code === "ENOENT") return { ok: true, projects: {}, port: null, projectDir: null };
    return { ok: false, reason: String(e?.code ?? e?.message ?? err) };
  }
  return parseProfiles(text);
}

/** What can still be trusted in an install file that parseProfiles may refuse (#65): the root
 * `projectDir` when it is a non-empty string, and per map entry its `dir` and `port` when each is
 * valid on its own (a sibling's or its own other bad field does not matter). Uses the same field
 * checks as parseProfiles. Unreadable file, invalid JSON or a non-object root → null (nothing can
 * be trusted); a missing file is null too. Entry dirs resolve against the install.
 * @param {string} installDir
 * @param {{ readFile?: (file: string) => string }} [deps]
 * @returns {{ projectDir: string | null,
 *   entries: { name: string, dir: string | null, port: number | null }[] } | null} */
export function salvageProfiles(installDir, { readFile = readUtf8 } = {}) {
  /** @type {unknown} */
  let data;
  try {
    data = parseJSON(readFile(path.join(installDir, ".xenomoon.json")));
  } catch {
    return null;
  }
  if (!isObject(data)) return null;
  const projects = isObject(data.projects) ? data.projects : {};
  const install = path.resolve(installDir);
  return {
    projectDir: isDir(data.projectDir) ? data.projectDir : null,
    entries: Object.entries(projects).map(([name, p]) => ({
      name,
      dir: isObject(p) && isDir(p.dir) ? path.resolve(install, p.dir) : null,
      port: isObject(p) && isPort(p.port) ? p.port : null,
    })),
  };
}

/** One project of one install, as the hub, CLI, port picker and name guards see it.
 * @typedef {{ install: string, name: string, dir: string, port: number | null }} ProjectEntry */

/** The projects of one install, sorted by name. `install` and `dir` are absolute (a relative
 * `dir` resolves against the install). An unreadable or invalid install file gives []. The root
 * `projectDir` is not a project and is ignored.
 * @param {string} installDir
 * @param {{ readFile?: (file: string) => string }} [deps]
 * @returns {ProjectEntry[]} */
export function projectsOf(installDir, deps = {}) {
  const parsed = readProfiles(installDir, deps);
  if (!parsed.ok) return [];
  const install = path.resolve(installDir);
  return Object.entries(parsed.projects)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, p]) => ({
      install,
      name,
      dir: path.resolve(install, p.dir),
      port: p.port ?? null,
    }));
}

/** Every project of every install in an installs map (keys only; values are ignored), installs
 * in sorted order. A missing or invalid install file contributes nothing and never throws.
 * @param {Record<string, unknown>} installs
 * @param {{ readFile?: (file: string) => string }} [deps]
 * @returns {ProjectEntry[]} */
export function projectsOfInstalls(installs, deps = {}) {
  return Object.keys(installs)
    .sort()
    .flatMap((install) => projectsOf(install, deps));
}

/** The project whose `dir` is `cwd` or an ancestor of it; the deepest `dir` wins. When that
 * deepest `dir` is listed by two different installs the result is `{ match: null, ambiguous }`
 * with the competing entries, so a caller can tell "ambiguous" (non-empty) from "none" (empty).
 * Paths are compared lexically after path.resolve (symlinks are not followed: the helper stays
 * pure, no filesystem access).
 * @param {string} cwd @param {ProjectEntry[]} projects
 * @returns {{ match: ProjectEntry | null, ambiguous: ProjectEntry[] }} */
export function projectAt(cwd, projects) {
  const hits = projects.filter((p) => contains(p.dir, cwd));
  const depth = Math.max(-1, ...hits.map((p) => p.dir.length));
  const deepest = hits.filter((p) => p.dir.length === depth);
  const installs = new Set(deepest.map((p) => p.install));
  if (installs.size > 1) return { match: null, ambiguous: deepest };
  return { match: deepest[0] ?? null, ambiguous: [] };
}
