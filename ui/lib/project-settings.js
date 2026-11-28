// Per-project settings (#84): `<project>/.xenomoon/settings.json` holds the settings that
// belong to one project, not to the install (the `onboarded` flag and the approvals
// `policy`). Pure: no config import, no side effect at import, so both the server and a
// Claude Code hook process can import it.
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseJSON } from "./json.js";
import { projectSettingsFile } from "./project-paths.js";

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/** @param {string} p @returns {import("node:fs").Stats | null} lstat (links not followed), null when absent. */
function lstatOrNull(p) {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
}

/** A real directory, never a symlink to one. @param {string} p @returns {boolean} */
function isRealDir(p) {
  return lstatOrNull(p)?.isDirectory() === true;
}

/**
 * Whether the settings path stays inside the project: `.xenomoon` is absent or a real
 * directory, and `settings.json` is absent or a regular file. A symlink at either level, or
 * anything else there, could point at another project's "allow", so it reads as defaults and
 * is never written through. Shared by every read and the write.
 * @param {string} projectDir @returns {boolean}
 */
function settingsPathIsSafe(projectDir) {
  const file = projectSettingsFile(projectDir);
  const marker = lstatOrNull(path.dirname(file));
  if (!marker) return true;
  if (!marker.isDirectory()) return false;
  const st = lstatOrNull(file);
  return !st || st.isFile();
}

/** The file's content as an object, or `{}` when missing, unreadable, unsafe (see
 * settingsPathIsSafe), not JSON or not an object.
 * @param {string} projectDir @returns {Record<string, unknown>} */
function readRaw(projectDir) {
  if (!settingsPathIsSafe(projectDir)) return {};
  try {
    const data = parseJSON(readFileSync(projectSettingsFile(projectDir), "utf8"));
    return isPlainObject(data) ? data : {};
  } catch {
    return {};
  }
}

/** @param {string} p @returns {boolean} */
function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Real path of an absolute `p`, else `p` normalised. Never resolves against process.cwd().
 * @param {string} p @returns {string} */
function realOrNormal(p) {
  if (!path.isAbsolute(p)) return path.normalize(p);
  try {
    return realpathSync(p);
  } catch {
    return path.normalize(p);
  }
}

/**
 * The project's settings. A missing or bad file reads as not onboarded with an empty policy.
 * @param {string} projectDir
 * @returns {{ onboarded: boolean, policy: Record<string, unknown> }}
 */
export function readProjectSettings(projectDir) {
  const raw = readRaw(projectDir);
  return {
    onboarded: raw.onboarded === true,
    policy: isPlainObject(raw.policy) ? raw.policy : {},
  };
}

/**
 * Whether the settings file holds `key` at the top level, whatever its value. The install's
 * create-only seed needs this: `readProjectSettings` reads a missing key as its default.
 * @param {string} projectDir @param {string} key @returns {boolean}
 */
export function hasProjectSetting(projectDir, key) {
  return Object.hasOwn(readRaw(projectDir), key);
}

/**
 * Consequential-action policy: the `policy` block of the project's settings file.
 *
 * `push` does not answer "may an agent publish" — a LANE answers that (see PUSH_AGENT in
 * ui/lib/consequential.js). It answers "does the sanctioned push stage ask a human first".
 * `merge` is the same gate on `gh pr merge` / `issuekit pr merge|promote`. `ask` is the default;
 * `allow` is the per-project opt-in an unattended pipeline needs, since it cannot answer a prompt.
 *
 * KNOWN BOUNDARY: this layer governs sessions the framework server drives; a plain `claude`
 * session in the project does not pass through it.
 *
 * @typedef {{ push?: "ask" | "allow", merge?: "ask" | "allow", dependencies?: "ask" | "allow", branchCreate?: "ask" | "allow", spend?: "ask" | "allow", spendPatterns?: string[], migrationPush?: "ask" | "allow", migrationsPending?: string, codexReview?: "ask" | "allow" }} ActionPolicy
 */

/**
 * The full policy from a raw `policy` value. ASK is the default AND the fallback for anything
 * unrecognised: the file is hand-edited, so a typo, a stale value or a boolean must not switch
 * the prompt off — only the exact string "allow" allows. Failing open on a corrupted file is the
 * one direction that cannot be undone. Pure.
 * @param {unknown} raw
 * @returns {Required<ActionPolicy>}
 */
export function normalizeActionPolicy(raw) {
  const p = isPlainObject(raw) ? raw : {};
  /** @param {unknown} v @returns {"ask" | "allow"} */
  const mode = (v) => (v === "allow" ? "allow" : "ask");
  return {
    push: mode(p.push),
    merge: mode(p.merge),
    dependencies: mode(p.dependencies),
    branchCreate: mode(p.branchCreate),
    spend: mode(p.spend),
    migrationPush: mode(p.migrationPush),
    // Codex review consent (require-codex-consent.sh reads the same key): `allow` lets an
    // unattended run fire reviews. A knob, never billing-derived.
    codexReview: mode(p.codexReview),
    // The NAME of one of the project's own npm scripts that answers "are there unapplied
    // migrations?" by its exit code. A name, never a command line: a shell string from a file
    // would run at push time, before the human sees the prompt. Project-local, never a pack
    // default: whether a pending migration is a hazard is a fact of this project's deployment.
    migrationsPending: typeof p.migrationsPending === "string" ? p.migrationsPending : "",
    // The project's own paid commands (CORE already knows the model endpoints). Non-strings are
    // dropped rather than trusted into a matcher.
    spendPatterns: Array.isArray(p.spendPatterns)
      ? /** @type {unknown[]} */ (p.spendPatterns).filter(
          /** @returns {s is string} */ (s) => typeof s === "string" && s.length > 0,
        )
      : [],
  };
}

/** The project's normalised action policy. @param {string} projectDir @returns {Required<ActionPolicy>} */
export function readActionPolicy(projectDir) {
  return normalizeActionPolicy(readProjectSettings(projectDir).policy);
}

/**
 * The project's Chrome profile: `browser.deviceId`, written by hand by the owner. "" when the
 * file, the block or the key is missing, or the value is not a non-empty string.
 * @param {string} projectDir @returns {{ deviceId: string }}
 */
export function readBrowserSettings(projectDir) {
  const b = readRaw(projectDir).browser;
  const id = isPlainObject(b) ? b.deviceId : undefined;
  return { deviceId: typeof id === "string" && id.length > 0 ? id : "" };
}

/**
 * Merge `patch` (top-level keys) into the settings file, keeping every other key. Creates
 * `.xenomoon/` when absent, never the project dir itself. Replaces the file atomically (temp
 * file + rename). False, nothing written, when the settings path is unsafe (see
 * settingsPathIsSafe). Never throws.
 * @param {string} projectDir
 * @param {Record<string, unknown>} patch
 * @returns {boolean} true when written
 */
export function writeProjectSettings(projectDir, patch) {
  if (!projectDir || !isDir(projectDir) || !settingsPathIsSafe(projectDir)) return false;
  const file = projectSettingsFile(projectDir);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const text = `${JSON.stringify({ ...readRaw(projectDir), ...patch }, null, 2)}\n`;
    // Full content to a sibling temp file ("wx": never through an existing path), then one
    // rename: a reader sees the old file or the new one, never a half-written one.
    writeFileSync(tmp, text, { flag: "wx" });
    renameSync(tmp, file);
    return true;
  } catch {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // `force` swallows only ENOENT; "never throws" holds even when cleanup fails.
    }
    return false;
  }
}

/**
 * The nearest ancestor of `cwd` (itself included) that holds a `.xenomoon` directory (a
 * real one: a symlinked `.xenomoon` does not mark a project), compared on real paths. `cwd`
 * must be an absolute path to an existing directory, else "": a relative one would resolve
 * against this process's folder, not the payload's. `home` is never a project (its `.xenomoon/` is the install
 * registry) and nothing at or above it is searched. "" when none. Never throws.
 * @param {string} cwd
 * @param {string} [home]
 * @returns {string}
 */
export function resolveProjectDir(cwd, home = os.homedir()) {
  if (typeof cwd !== "string" || !path.isAbsolute(cwd) || !isDir(cwd)) return "";
  try {
    const realHome = home ? realOrNormal(home) : "";
    let dir = realpathSync(cwd);
    for (;;) {
      const parent = path.dirname(dir);
      if (dir === realHome || parent === dir) return "";
      if (isRealDir(path.join(dir, ".xenomoon"))) return dir;
      dir = parent;
    }
  } catch {
    return "";
  }
}
