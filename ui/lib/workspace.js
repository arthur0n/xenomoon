/** The multi-repo workspace manifest (#36) and the per-repo resolver (#37).
 *
 * A bound projectDir can be a plain PARENT folder holding several git repos. The parent says so
 * with `<parent>/.xenomoon/workspace.json` — a LOCAL file of the bound folder, never shipped in a
 * pack and never written inside the framework repo. Format: plugin/docs/workspace-manifest.md.
 *
 *   { "version": 1,
 *     "repos": [ { "name": "acme-api", "path": "acme-api",
 *                  "remote": "git@github.com:acme-co/acme-api.git",
 *                  "upstream": "…optional…", "mirror": "…optional…" } ] }
 *
 * Node builtins only (same rule as branch-doctrine.js): issuekit, the hooks' node helpers and the
 * spine all load this, and none of them may drag in `config.js`.
 */
import { readFileSync, existsSync, realpathSync } from "node:fs";
import path from "node:path";

export const WORKSPACE_FILE = path.join(".xenomoon", "workspace.json");

/** @typedef {{ name: string, path: string, remote: string, upstream?: string, mirror?: string }} WorkspaceRepo */
/** @typedef {{ version: 1, repos: WorkspaceRepo[] }} WorkspaceManifest */
/** A loaded workspace: the parent folder, the manifest file, and the repos with absolute dirs.
 * @typedef {{ root: string, file: string, manifest: WorkspaceManifest,
 *   repos: (WorkspaceRepo & { dir: string })[] }} Workspace */

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const KEYS = new Set(["name", "path", "remote", "upstream", "mirror"]);

/** Field-level problems of one repo entry. @param {Record<string, unknown>} repo @param {string} at
 * @returns {string[]} */
function fieldErrors(repo, at) {
  /** @type {string[]} */
  const errors = [];
  for (const k of Object.keys(repo)) if (!KEYS.has(k)) errors.push(`${at}: unknown key "${k}"`);
  for (const k of ["name", "path", "remote"])
    if (typeof repo[k] !== "string" || !String(repo[k]).trim())
      errors.push(`${at}.${k} must be a non-empty string`);
  for (const k of ["upstream", "mirror"])
    if (repo[k] !== undefined && (typeof repo[k] !== "string" || !String(repo[k]).trim()))
      errors.push(`${at}.${k}, when set, must be a non-empty string`);
  if (typeof repo.name === "string" && repo.name && !NAME.test(repo.name))
    errors.push(`${at}.name "${repo.name}" has unsafe characters`);
  return errors;
}

/** Path problems of one repo entry against the paths seen so far (pushes its own).
 * @param {string} raw @param {string} at @param {string[]} paths @returns {string[]} */
function pathErrors(raw, at, paths) {
  const p = path.posix.normalize(raw.replace(/\\/g, "/")).replace(/\/$/, "");
  if (path.isAbsolute(raw) || p === "." || p === ".." || p.startsWith("../"))
    return [`${at}.path "${raw}" must be a relative path inside the parent folder`];
  // Nested children would make repoFor() ambiguous — the manifest lists siblings only.
  const clash = paths.find((q) => q === p || q.startsWith(`${p}/`) || p.startsWith(`${q}/`));
  paths.push(p);
  return clash ? [`${at}.path "${raw}" overlaps "${clash}"`] : [];
}

/** Every problem with a parsed manifest, as human-readable lines; empty = valid.
 * @param {unknown} m @returns {string[]} */
export function validateManifest(m) {
  if (!m || typeof m !== "object" || Array.isArray(m)) return ["manifest must be a JSON object"];
  const obj = /** @type {Record<string, unknown>} */ (m);
  /** @type {string[]} */
  const errors = [];
  if (obj.version !== 1) errors.push(`version must be 1 (got ${JSON.stringify(obj.version)})`);
  if (!Array.isArray(obj.repos) || obj.repos.length === 0)
    return [...errors, "repos must be a non-empty array"];
  /** @type {Set<string>} */
  const names = new Set();
  /** @type {string[]} */
  const paths = [];
  /** @type {unknown[]} */ (obj.repos).forEach((r, i) => {
    const at = `repos[${i}]`;
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      errors.push(`${at} must be an object`);
      return;
    }
    const repo = /** @type {Record<string, unknown>} */ (r);
    errors.push(...fieldErrors(repo, at));
    if (typeof repo.name === "string") {
      if (names.has(repo.name)) errors.push(`${at}.name "${repo.name}" is a duplicate`);
      names.add(repo.name);
    }
    if (typeof repo.path === "string" && repo.path.trim())
      errors.push(...pathErrors(repo.path, at, paths));
  });
  return errors;
}

/** Read and validate one manifest file wherever it lives. THROWS on bad JSON or a bad shape.
 * @param {string} file @returns {WorkspaceManifest} */
export function readManifest(file) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = /** @type {unknown} */ (JSON.parse(readFileSync(file, "utf8")));
  } catch (e) {
    throw new Error(`workspace manifest ${file} is not valid JSON`, { cause: e });
  }
  const errors = validateManifest(parsed);
  if (errors.length)
    throw new Error(`workspace manifest ${file} is invalid:\n  - ${errors.join("\n  - ")}`);
  return /** @type {WorkspaceManifest} */ (parsed);
}

/** Load and validate `<root>/.xenomoon/workspace.json`. Returns null when the file is absent;
 * THROWS (loud) when it is present but unreadable or invalid — a half-read manifest must never
 * silently degrade into "not a workspace".
 * @param {string} root @returns {Workspace | null} */
export function loadWorkspace(root) {
  const file = path.join(root, WORKSPACE_FILE);
  if (!existsSync(file)) return null;
  const manifest = readManifest(file);
  return {
    root,
    file,
    manifest,
    repos: manifest.repos.map((r) => ({ ...r, dir: path.resolve(root, r.path) })),
  };
}

/** Walk UP from `start` to the nearest folder holding a workspace manifest.
 * @param {string} [start] @returns {Workspace | null} */
export function findWorkspace(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    const ws = loadWorkspace(dir);
    if (ws) return ws;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Resolve symlinks where the path exists (macOS /var → /private/var), else leave it.
 * @param {string} p @returns {string} */
function real(p) {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** Which child repo of the workspace `p` belongs to, or null (the parent itself, or outside).
 * @param {Workspace} ws @param {string} p @returns {(WorkspaceRepo & { dir: string }) | null} */
export function repoFor(ws, p) {
  const target = real(p);
  for (const r of ws.repos) {
    const dir = real(r.dir);
    if (target === dir || target.startsWith(dir + path.sep)) return r;
  }
  return null;
}

/** `owner/name` from a GitHub remote URL (ssh or https), or null for any other host.
 * @param {string} remote @returns {string | null} */
export function githubSlug(remote) {
  const m = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remote.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}
