// The one safe way to read and change an install's `<installDir>/.xenomoon.json`, which
// several project server processes share. A strict read never turns a bad file into `{}`,
// and a write replaces the file in one rename, so a reader sees the old or the new content.
// Pure: only `node:` imports and parseJSON, no side effect at import.
import {
  chmodSync,
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { parseJSON } from "./json.js";

/** @typedef {{ ok: true, config: Record<string, unknown>, existed: boolean } | { error: string }} StrictReadResult */
/** @typedef {{ ok: true, config: Record<string, unknown> } | { error: string }} UpdateResult */
/**
 * What an `updateInstallConfig` callback returns: `{ next }` is the whole object to write
 * (keys left out of it are removed), `{ refuse }` is a reason to write nothing. Any other
 * value is a refusal too.
 * @typedef {{ next: Record<string, unknown> } | { refuse: string }} MutateResult
 */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/** @param {unknown} err @returns {string} */
const errText = (err) => (err instanceof Error ? err.message : String(err));

/** @param {string} installDir @returns {string} */
const configFile = (installDir) => path.join(installDir, ".xenomoon.json");

/** Whether a directory entry exists at `file` (true for a dangling symlink). @param {string} file */
function entryExists(file) {
  try {
    lstatSync(file);
    return true;
  } catch (err) {
    return /** @type {NodeJS.ErrnoException} */ (err).code !== "ENOENT";
  }
}

/**
 * Read `<installDir>/.xenomoon.json` strictly. Missing → `{ ok, config: {}, existed: false }`.
 * Unreadable, a dangling symlink, empty, not JSON, or not a plain object → `{ error }` naming
 * the file and never its content. Never throws.
 * @param {string} installDir
 * @returns {StrictReadResult}
 */
export function readInstallConfigStrict(installDir) {
  const file = configFile(installDir);
  /** @param {string} why @returns {{ error: string }} */
  const fail = (why) => ({ error: `${file}: ${why}; nothing was written` });
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== "ENOENT") {
      return fail(`cannot be read (${errText(err)})`);
    }
    return entryExists(file)
      ? fail("is a symlink to a missing file")
      : { ok: true, config: {}, existed: false };
  }
  if (text.trim() === "") return fail("is empty");
  let data;
  try {
    data = parseJSON(text);
  } catch {
    // The parser's message can quote the file's content (a secret), so it is never shown.
    return fail("is not valid JSON");
  }
  if (!isPlainObject(data)) {
    const kind = data === null ? "null" : Array.isArray(data) ? "an array" : typeof data;
    return fail(`holds ${kind}, not a JSON object`);
  }
  return { ok: true, config: data, existed: true };
}

/**
 * The path a write lands on: the target itself, or a symlink's real target, so the link
 * stays a link. A dangling link throws (nothing to write through to).
 * @param {string} file @returns {{ dest: string, mode: number | null }} mode of an existing target
 */
function writeTarget(file) {
  let st;
  try {
    st = lstatSync(file);
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === "ENOENT")
      return { dest: file, mode: null };
    throw err;
  }
  const dest = st.isSymbolicLink() ? realpathSync(file) : file;
  return { dest, mode: statSync(dest).mode & 0o7777 };
}

/**
 * Replace `file` with `text`: an exclusive temp file beside the destination, then one rename.
 * An existing target keeps its permission bits; a new file gets what `writeFileSync` gives
 * (0o666 less the umask), as the writers it replaces do. The temp is removed on any failure.
 * @param {string} file @param {string} text @returns {{ ok: true } | { error: string }}
 */
function writeAtomic(file, text) {
  let tmp = "";
  try {
    const { dest, mode } = writeTarget(file);
    tmp = path.join(
      path.dirname(dest),
      `${path.basename(dest)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
    );
    const fd = openSync(tmp, "wx", mode === null ? 0o666 : 0o600);
    try {
      writeFileSync(fd, text);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (mode !== null) chmodSync(tmp, mode);
    renameSync(tmp, dest);
    return { ok: true };
  } catch (err) {
    if (tmp) {
      try {
        rmSync(tmp, { force: true });
      } catch {
        // Cleanup failing must not hide the write error.
      }
    }
    return { error: `${file}: write failed (${errText(err)})` };
  }
}

/**
 * Change `<installDir>/.xenomoon.json` safely. Reads it strictly (a bad file → `{ error }`,
 * nothing written), hands the whole object to `mutate`, and writes exactly the `next` object
 * it returns as `JSON.stringify(next, null, 2) + "\n"`. A `{ refuse }` (or any other return,
 * or a throw) writes nothing and comes back as `{ error }`; a throw gives the fixed text
 * `<file>: update callback threw; nothing was written`, nothing from the thrown value. No lock: two concurrent updates
 * can still lose one of the two changes, but never leave the file empty or half-written.
 * @param {string} installDir
 * @param {(config: Record<string, unknown>) => MutateResult} mutate
 * @returns {UpdateResult}
 */
export function updateInstallConfig(installDir, mutate) {
  const read = readInstallConfigStrict(installDir);
  if ("error" in read) return read;
  const file = configFile(installDir);
  /** @type {unknown} */
  let result;
  try {
    result = mutate(read.config);
  } catch {
    // Every part of a thrown value (message, name, code) can carry a config secret: none is shown.
    return { error: `${file}: update callback threw; nothing was written` };
  }
  if (isPlainObject(result) && typeof result.refuse === "string") {
    return { error: result.refuse || `${file}: update refused; nothing was written` };
  }
  if (!isPlainObject(result) || !isPlainObject(result.next)) {
    return {
      error: `${file}: update callback returned neither { next } nor { refuse }; nothing was written`,
    };
  }
  const next = result.next;
  const written = writeAtomic(file, `${JSON.stringify(next, null, 2)}\n`);
  return "error" in written ? written : { ok: true, config: next };
}
