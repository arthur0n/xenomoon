// Start and stop a hub row's server through the install's own start_server / stop_server scripts.
// Every operation reads a fresh status snapshot first and refuses when the port is held, shared
// with a running row, or in an unclear state. One operation at a time per port, whatever the install.
import { execFile } from "node:child_process";
import { aggregate } from "./status.js";

/** @typedef {import("./rows.js").HubRow} HubRow */
/** @typedef {import("./status.js").HubRowStatus} HubRowStatus */
/** @typedef {{ status: number | null, stdout: string, stderr: string }} RunResult */
/** @typedef {(file: string, args: string[], opts: { cwd: string, env: NodeJS.ProcessEnv }) => Promise<RunResult>} Run */
/** @typedef {(rows: HubRow[]) => Promise<{ rows: HubRowStatus[] }>} Snapshot */

/**
 * @typedef {{
 *   ok: boolean,
 *   code: number,
 *   state?: "on" | "off" | "unknown",
 *   noop?: boolean,
 *   reason?: string,
 *   tail?: string,
 * }} OpResult
 */

const TAIL_LINES = 15;
const RUN_TIMEOUT_MS = 20000;

/** `bash <file> ...args`; a non-zero exit resolves with its code, a spawn failure with null.
 * @type {Run} */
export function defaultRun(file, args, { cwd, env }) {
  return new Promise((resolve) => {
    execFile(
      "bash",
      [file, ...args],
      { cwd, env, timeout: RUN_TIMEOUT_MS },
      (err, stdout, stderr) => {
        const code = /** @type {{ code?: unknown } | null} */ (err)?.code;
        const status = err ? (typeof code === "number" ? code : null) : 0;
        resolve({ status, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

/** The last lines of stderr then stdout.
 * @param {RunResult} result @returns {string} */
function tailOf({ stderr, stdout }) {
  const lines = `${stderr}\n${stdout}`.split("\n").filter((line) => line.trim() !== "");
  return lines.slice(-TAIL_LINES).join("\n");
}

/** @param {HubRow} row @returns {NodeJS.ProcessEnv} */
function envFor(row) {
  return {
    ...process.env,
    PORT: String(row.port),
    ...(row.domain ? { XENOMOON_DOMAIN: row.domain } : {}),
  };
}

/** The row's own status and the other rows on its port, from one snapshot.
 * @param {Snapshot} snapshot @param {HubRow} row @param {HubRow[]} rows
 * @returns {Promise<{ self: HubRowStatus | undefined, peers: HubRowStatus[] }>} */
async function look(snapshot, row, rows) {
  const all = rows.some((r) => r.id === row.id) ? rows : [...rows, row];
  const { rows: seen } = await snapshot(all);
  const self = seen.find((r) => r.id === row.id);
  const peers = seen.filter((r) => r.id !== row.id && r.port === row.port);
  return { self, peers };
}

/** A refusal for a port that is held, or unknown; null when the state allows going on.
 * @param {HubRowStatus | undefined} self @returns {OpResult | null} */
function refuseUnclear(self) {
  if (!self) return { ok: false, code: 409, reason: "port state unknown: row not in snapshot" };
  if (self.state === "held") {
    return {
      ok: false,
      code: 409,
      reason: `port held by ${self.status?.path ?? "another project"}`,
    };
  }
  if (self.state === "unknown") {
    return { ok: false, code: 409, reason: `port state unknown: ${self.reason ?? "no reason"}` };
  }
  return null;
}

/** @param {Run} run @param {Snapshot} snapshot @param {HubRow} row @param {HubRow[]} rows
 * @returns {Promise<OpResult>} */
async function doStart(run, snapshot, row, rows) {
  if (row.project === null) return { ok: false, code: 409, reason: "no bound project" };
  const { self, peers } = await look(snapshot, row, rows);
  if (self?.state === "on") return { ok: true, code: 200, state: "on", noop: true };
  const unclear = refuseUnclear(self);
  if (unclear) return unclear;
  const holder = peers.find((p) => p.state === "on");
  if (holder)
    return { ok: false, code: 409, reason: `port ${row.port} in use by row ${holder.id}` };
  const result = await run(`${row.install}/start_server`, [row.project], {
    cwd: row.install,
    env: envFor(row),
  });
  if (result.status === 0) return { ok: true, code: 200, state: "on" };
  if (result.status === 3)
    return { ok: false, code: 503, reason: "lsof missing", tail: tailOf(result) };
  return {
    ok: false,
    code: 502,
    reason: `start_server exit ${result.status}`,
    tail: tailOf(result),
  };
}

/** @param {Run} run @param {Snapshot} snapshot @param {HubRow} row @param {HubRow[]} rows
 * @returns {Promise<OpResult>} */
async function doStop(run, snapshot, row, rows) {
  const { self } = await look(snapshot, row, rows);
  if (self?.state === "off" || self?.state === "unbound") {
    return { ok: true, code: 200, state: "off", noop: true };
  }
  const unclear = refuseUnclear(self);
  if (unclear) return unclear;
  const env = { ...process.env, PORT: String(row.port) };
  const result = await run(`${row.install}/stop_server`, [], { cwd: row.install, env });
  if (result.status === 0) return { ok: true, code: 200, state: "off" };
  if (result.status === 3) {
    const reason = "stop_server could not tell";
    return { ok: false, code: 502, reason, state: "unknown", tail: tailOf(result) };
  }
  return {
    ok: false,
    code: 502,
    reason: `stop_server exit ${result.status}`,
    tail: tailOf(result),
  };
}

/** start / stop for hub rows, serialized per port alone: one machine has one listener per port, and
 * two registry entries can alias one physical install (a symlink), so an install-based key would
 * let two starts on one port both read "off". The snapshot runs inside the serialized op.
 * @param {{ run?: Run, snapshot?: Snapshot }} [deps] */
export function makeLifecycle({ run = defaultRun, snapshot = (rows) => aggregate(rows) } = {}) {
  /** @type {Map<string, Promise<unknown>>} */
  const tails = new Map();

  /** @param {HubRow} row @param {() => Promise<OpResult>} op @returns {Promise<OpResult>} */
  function serialize(row, op) {
    const key = String(row.port);
    const prev = tails.get(key) ?? Promise.resolve();
    const next = prev.then(op, op);
    const settled = next.catch(() => undefined);
    tails.set(key, settled);
    void settled.then(() => {
      if (tails.get(key) === settled) tails.delete(key);
    });
    return next;
  }

  return {
    /** @param {HubRow} row @param {HubRow[]} rows @returns {Promise<OpResult>} */
    start: (row, rows) => serialize(row, () => doStart(run, snapshot, row, rows)),
    /** @param {HubRow} row @param {HubRow[]} rows @returns {Promise<OpResult>} */
    stop: (row, rows) => serialize(row, () => doStop(run, snapshot, row, rows)),
    /** Keys with an operation in flight or queued (for tests). @returns {number} */
    busy: () => tails.size,
  };
}
