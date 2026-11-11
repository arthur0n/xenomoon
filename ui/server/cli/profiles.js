// Named per-project launch profiles: the `projects` map inside the install's .xenomoon.json.
// A BOOTSTRAP helper like start-profile.js: it never imports config.js, only reads the file.
// parseProfiles is pure and total (a bad shape is an `ok:false` with a one-line reason naming
// the field, mirroring parseRegistry); readProfiles adds the file read, with readFile injectable.
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../lib/json.js";

/** @typedef {{ dir: string, port?: number, domain?: string }} Profile */

/**
 * @typedef {{ ok: true, projects: Record<string, Profile>, port: number | null, projectDir: string | null }
 *   | { ok: false, reason: string }} ProfilesParse
 */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/** Why one profile entry is invalid, or null when it is a valid Profile.
 * @param {string} name @param {unknown} p @returns {string | null} */
function profileProblem(name, p) {
  const at = `projects["${name}"]`;
  if (!isObject(p)) return `${at} is not an object`;
  if (typeof p.dir !== "string" || !p.dir) return `${at}.dir is missing or not a string`;
  if (p.port !== undefined && !(Number.isInteger(p.port) && /** @type {number} */ (p.port) > 0)) {
    return `${at}.port is not a positive integer`;
  }
  if (p.domain !== undefined && (typeof p.domain !== "string" || !p.domain)) {
    return `${at}.domain is not a non-empty string`;
  }
  return null;
}

/** Validate .xenomoon.json text; only the `projects` map and the root `projectDir` are checked.
 * The root `port` is carried through when it is a positive integer, else null. The root
 * `projectDir` (the bound project of a single-project install) is a non-empty string or absent
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
  const port =
    Number.isInteger(data.port) && /** @type {number} */ (data.port) > 0
      ? /** @type {number} */ (data.port)
      : null;
  if (data.projectDir !== undefined && (typeof data.projectDir !== "string" || !data.projectDir)) {
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
export function readProfiles(installDir, { readFile = (f) => readFileSync(f, "utf8") } = {}) {
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
