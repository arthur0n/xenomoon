// Build-at-start for the hub page (#94): ui/hub/dist/ is rebuilt with Vite when it is missing or
// any build input's content changed since the last completed build. Vite writes into a temporary
// folder beside dist/, which replaces dist/ only after a completed build (rolled back if the swap
// fails); a lock folder, taken and reclaimed by atomic renames, lets one build run at a time.
// The Vite run and the publish rename are injected so tests run no real build.
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));

/** Shared files the page uses from outside ui/hub/, relative to the repo root: the tokens (:root of
 * agent-ui.css) and the font links (index.html) read by ui/hub/vite.config.js, the favicon
 * (ui/hub/index.html), the mark (ui/hub/src/HubHeader.jsx) and the port rule (ui/hub/src/rows.js). */
export const SHARED_INPUTS = [
  "ui/agent-ui.css",
  "ui/index.html",
  "ui/assets/favicon.png",
  "ui/assets/mark.webp",
  "ui/lib/port.js",
];

/** The build record, written inside the built folder so it is published with the page. */
export const RECORD_NAME = ".hub-build.json";

/** Temporary build folders and the lock all start with this; the stale check skips them. */
const BUILD_PREFIX = ".build";

/** Leftovers of a crashed build or lock step, removed by the next lock holder. Claims are not:
 * a claim names a lock that is already gone, or one whose reclaimer is still at work. */
const LEFTOVER = /^\.build-(old|tmp|dead|cand)-/;

const OWNER_FILE = "owner.json";

/** @param {string} root */
export function hubPaths(root = REPO_ROOT) {
  const hubDir = path.join(root, "ui", "hub");
  const distDir = path.join(hubDir, "dist");
  return {
    root,
    hubDir,
    distDir,
    recordFile: path.join(distDir, RECORD_NAME),
    lockDir: path.join(hubDir, `${BUILD_PREFIX}.lock`),
    viteConfig: path.join(hubDir, "vite.config.js"),
  };
}

/** @param {string} file @returns {string} */
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/** Every file under `dir`, skipping dist/, node_modules/ and the build's own temporary entries.
 * @param {string} dir @param {string} hubDir @param {string[]} out @returns {string[]} */
function walk(dir, hubDir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (dir === hubDir && (ent.name === "dist" || ent.name.startsWith(BUILD_PREFIX))) continue;
    if (ent.name === "node_modules") continue;
    if (ent.isDirectory()) walk(full, hubDir, out);
    else if (ent.isFile()) out.push(full);
  }
  return out;
}

/** Content fingerprint of every build input, keyed by path relative to the repo root.
 * @param {string} [root] @returns {Record<string, string>} */
export function buildInputs(root = REPO_ROOT) {
  const p = hubPaths(root);
  const files = new Set(walk(p.hubDir, p.hubDir, []));
  files.add(p.viteConfig);
  files.add(path.join(root, "package-lock.json"));
  for (const rel of SHARED_INPUTS) files.add(path.join(root, rel));
  /** @type {Record<string, string>} */
  const inputs = {};
  for (const file of [...files].sort()) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    inputs[rel] = fs.existsSync(file) ? sha256(file) : "missing";
  }
  return inputs;
}

/** @param {string} file @returns {unknown} */
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

/** @param {string} file @returns {Record<string, string> | null} */
function readRecord(file) {
  try {
    const rec = /** @type {{ inputs?: unknown }} */ (readJson(file));
    return rec.inputs && typeof rec.inputs === "object"
      ? /** @type {Record<string, string>} */ (rec.inputs)
      : null;
  } catch {
    return null;
  }
}

/** Whether the built page must be rebuilt, with the first reason found.
 * @param {string} [root] @returns {{ stale: boolean, reason: string }} */
export function hubStaleness(root = REPO_ROOT) {
  const p = hubPaths(root);
  if (!fs.existsSync(path.join(p.distDir, "index.html")))
    return { stale: true, reason: "no built page" };
  const old = readRecord(p.recordFile);
  if (!old) return { stale: true, reason: "no build record" };
  const now = buildInputs(root);
  for (const k of Object.keys(now)) {
    if (!(k in old)) return { stale: true, reason: `added ${k}` };
    if (old[k] !== now[k]) return { stale: true, reason: `changed ${k}` };
  }
  for (const k of Object.keys(old)) if (!(k in now)) return { stale: true, reason: `removed ${k}` };
  return { stale: false, reason: "up to date" };
}

/** @typedef {(o: { root: string, outDir: string }) => Promise<{ ok: boolean, output: string }>} RunVite */

/** The real build: `vite build` with the hub config into `outDir`, output captured.
 * @type {RunVite} */
export function runViteBuild({ root, outDir }) {
  const bin = path.join(root, "node_modules", "vite", "bin", "vite.js");
  const args = [bin, "build", "--config", hubPaths(root).viteConfig, "--outDir", outDir];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...args, "--emptyOutDir"], { cwd: root });
    let output = "";
    child.stdout.on("data", (d) => {
      output += String(d);
    });
    child.stderr.on("data", (d) => {
      output += String(d);
    });
    child.on("error", (err) => {
      resolve({ ok: false, output: `${output}${err.message}` });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, output });
    });
  });
}

/** A failed hub build; `output` is what Vite printed. */
export class HubBuildError extends Error {
  /** @param {string} message @param {string} output */
  constructor(message, output) {
    super(`${message}\n${output}`);
    this.name = "HubBuildError";
    this.output = output;
  }
}

/** @param {unknown} err @returns {unknown} */
const errCode = (err) => /** @type {{ code?: unknown }} */ (err).code;

/** A reused pid held by an unrelated live process reads as alive; that case is accepted.
 * @param {number} pid @returns {boolean} */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return errCode(err) === "EPERM";
  }
}

/** A unique sibling path of `dir` named `.build-<kind>-<random>`.
 * @param {string} dir @param {string} kind */
const sibling = (dir, kind) =>
  path.join(path.dirname(dir), `${BUILD_PREFIX}-${kind}-${randomBytes(6).toString("hex")}`);

/** Move `dir` out of the way in one rename (only one mover wins), then delete it.
 * @param {string} dir @returns {boolean} false when `dir` was already gone */
function discard(dir) {
  const gone = sibling(dir, "dead");
  try {
    fs.renameSync(dir, gone);
  } catch (err) {
    if (errCode(err) === "ENOENT") return false;
    throw err;
  }
  fs.rmSync(gone, { recursive: true, force: true });
  return true;
}

/** @typedef {{ pid: number | null, token: string | null }} LockOwner */

/** The owner file of the lock, or null when no lock folder exists.
 * @param {string} lockDir @returns {LockOwner | null} */
function readOwner(lockDir) {
  try {
    const o = /** @type {{ pid?: unknown, token?: unknown }} */ (
      readJson(path.join(lockDir, OWNER_FILE))
    );
    const pid = typeof o.pid === "number" ? o.pid : null;
    return { pid, token: typeof o.token === "string" ? o.token : null };
  } catch {
    return fs.existsSync(lockDir) ? { pid: null, token: null } : null;
  }
}

/** One attempt to take the lock: the owner file is written into a candidate folder first, which
 * is then renamed onto the lock path; that rename fails while a lock (never empty) exists.
 * @param {string} lockDir @param {string} token @returns {boolean} */
function tryAcquire(lockDir, token) {
  const cand = path.join(path.dirname(lockDir), `${BUILD_PREFIX}-cand-${token}`);
  try {
    fs.mkdirSync(cand);
    const owner = { pid: process.pid, token, at: new Date().toISOString() };
    fs.writeFileSync(path.join(cand, OWNER_FILE), JSON.stringify(owner));
    fs.renameSync(cand, lockDir);
    return true;
  } catch (err) {
    fs.rmSync(cand, { recursive: true, force: true });
    // ENOENT: a lock holder removed this candidate as a leftover; try again
    if (["ENOTEMPTY", "EEXIST", "ENOENT"].includes(String(errCode(err)))) return false;
    throw err;
  }
}

/** Remove the lock of a dead owner. A claim folder keyed to that owner lets one waiter act, and
 * the owner is re-read under the claim, so a waiter that judged an older lock dead never removes
 * a newer one. A crash inside the claim leaves the lock in place (the waiters then time out).
 * @param {string} lockDir @param {LockOwner} dead @returns {boolean} true when it was removed */
export function reclaimLock(lockDir, dead) {
  const key = dead.token ?? `pid-${String(dead.pid)}`;
  const claim = path.join(path.dirname(lockDir), `${BUILD_PREFIX}-claim-${key}`);
  try {
    fs.mkdirSync(claim);
  } catch (err) {
    if (errCode(err) === "EEXIST") return false;
    throw err;
  }
  try {
    const now = readOwner(lockDir);
    if (now?.token !== dead.token || now?.pid !== dead.pid) return false;
    return discard(lockDir);
  } finally {
    fs.rmSync(claim, { recursive: true, force: true });
  }
}

/** @param {number} ms */
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Take the build lock, waiting while a live owner holds it; a dead owner's lock is reclaimed.
 * @param {string} lockDir @param {{ waitMs: number, pollMs: number }} o
 * @returns {Promise<string>} this acquisition's token */
async function takeLock(lockDir, { waitMs, pollMs }) {
  const token = randomBytes(8).toString("hex");
  const deadline = Date.now() + waitMs;
  for (;;) {
    if (tryAcquire(lockDir, token)) return token;
    const owner = readOwner(lockDir);
    if (!owner) continue; // released between the attempt and the read
    if (owner.pid !== null && !alive(owner.pid) && reclaimLock(lockDir, owner)) continue;
    if (Date.now() >= deadline) {
      const who = owner.pid === null ? "unknown" : `pid ${owner.pid}`;
      throw new Error(
        `hub build: another build (${who}) still holds ${lockDir} after ${waitMs} ms`,
      );
    }
    await pause(pollMs);
  }
}

/** Release the lock only when it is still this acquisition's.
 * @param {string} lockDir @param {string} token */
function releaseLock(lockDir, token) {
  if (readOwner(lockDir)?.token === token) discard(lockDir);
}

/** Under the lock: remove what a crashed build or lock step left in ui/hub/.
 * @param {string} hubDir */
function removeLeftovers(hubDir) {
  for (const name of fs.readdirSync(hubDir))
    if (LEFTOVER.test(name)) fs.rmSync(path.join(hubDir, name), { recursive: true, force: true });
}

/** @typedef {(from: string, to: string) => void} RenameDir */

/** Replace dist/ with the completed build in `tmpDir`; when the second rename fails the old page
 * is put back and the failure is thrown as a failed build.
 * @param {string} tmpDir @param {string} distDir @param {RenameDir} renameDir */
function publish(tmpDir, distDir, renameDir) {
  const oldDir = sibling(distDir, "old");
  const hadOld = fs.existsSync(distDir);
  if (hadOld) renameDir(distDir, oldDir);
  try {
    renameDir(tmpDir, distDir);
  } catch (err) {
    if (hadOld) fs.renameSync(oldDir, distDir);
    const msg = err instanceof Error ? err.message : String(err);
    throw new HubBuildError("hub build: could not publish; the previous page is kept", msg);
  }
  if (hadOld) fs.rmSync(oldDir, { recursive: true, force: true });
}

/** Build into a temporary folder and publish it with its record; throws HubBuildError on failure.
 * @param {{ root: string, runVite: RunVite, renameDir: RenameDir }} o */
async function buildAndPublish({ root, runVite, renameDir }) {
  const p = hubPaths(root);
  const inputs = buildInputs(root);
  const tmpDir = sibling(p.distDir, "tmp");
  try {
    const res = await runVite({ root, outDir: tmpDir });
    if (!res.ok || !fs.existsSync(path.join(tmpDir, "index.html")))
      throw new HubBuildError("hub build failed; the previous page is kept", res.output);
    fs.writeFileSync(path.join(tmpDir, RECORD_NAME), JSON.stringify({ inputs }, null, 2));
    publish(tmpDir, p.distDir, renameDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * @typedef {{ root?: string, runVite?: RunVite, waitMs?: number, pollMs?: number, renameDir?: RenameDir }} EnsureOptions
 */

/** Build the hub page when stale. A second caller during a build waits for it, then re-checks.
 * @param {EnsureOptions} [o]
 * @returns {Promise<{ built: boolean, reason: string }>} */
export async function ensureHubBuilt({
  root = REPO_ROOT,
  runVite = runViteBuild,
  waitMs = 60_000,
  pollMs = 100,
  renameDir = fs.renameSync,
} = {}) {
  const first = hubStaleness(root);
  if (!first.stale) return { built: false, reason: first.reason };
  const { lockDir, hubDir } = hubPaths(root);
  const token = await takeLock(lockDir, { waitMs, pollMs });
  try {
    removeLeftovers(hubDir);
    const now = hubStaleness(root);
    if (!now.stale) return { built: false, reason: now.reason };
    await buildAndPublish({ root, runVite, renameDir });
    return { built: true, reason: now.reason };
  } finally {
    releaseLock(lockDir, token);
  }
}
