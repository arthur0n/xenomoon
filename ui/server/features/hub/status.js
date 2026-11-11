// The hub's live view of each row: one GET to the row's port at /api/status, classified as
// on / held (the port answers for another project) / off / unbound / unknown. probeRow never
// throws; aggregate probes every row in parallel and marks rows that share a port.
// The request carries no Origin header, so the server keeps `lastLine` in its answer.
import { realpathSync } from "node:fs";

/** @typedef {import("./rows.js").HubRow} HubRow */
/** @typedef {import("../../core/http/status.js").StatusPayload} StatusPayload */
/** @typedef {"on" | "held" | "off" | "unbound" | "unknown"} ProbeState */
/** @typedef {{ state: ProbeState, status?: StatusPayload, reason?: string }} ProbeResult */
/** @typedef {HubRow & ProbeResult & { conflict?: string[] }} HubRowStatus */

/** realpath when the path exists, else the string itself.
 * @param {string} p @returns {string} */
function defaultRealpath(p) {
  try {
    return realpathSync.native(p);
  } catch {
    return p;
  }
}

/** @param {string} p @param {(p: string) => string} realpath @returns {string} */
function normalize(p, realpath) {
  const real = realpath(p);
  return real.length > 1 && real.endsWith("/") ? real.slice(0, -1) : real;
}

/** Errors from fetch: refused (undici TypeError with `cause.code`), timeout/abort, anything else.
 * @param {unknown} err @returns {ProbeResult} */
function classifyError(err) {
  const e =
    /** @type {{ name?: unknown, code?: unknown, message?: unknown, cause?: { code?: unknown } }} */ (
      err
    );
  if (e?.cause?.code === "ECONNREFUSED") return { state: "off" };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") {
    return { state: "unknown", reason: "timeout" };
  }
  return { state: "unknown", reason: String(e?.cause?.code ?? e?.code ?? e?.message ?? err) };
}

/**
 * @typedef {{
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 *   realpath?: (p: string) => string,
 * }} ProbeOptions
 */

/** A 200 response's body as a status payload, or the unknown it classifies as.
 * @param {Response} res @returns {Promise<{ status: StatusPayload } | ProbeResult>} */
async function readStatus(res) {
  /** @type {unknown} */
  let body;
  try {
    body = await res.json();
  } catch (err) {
    const name = /** @type {{ name?: unknown }} */ (err)?.name;
    if (name === "TimeoutError" || name === "AbortError") return classifyError(err);
    return { state: "unknown", reason: "not a status payload" };
  }
  const status = /** @type {StatusPayload} */ (body);
  if (!status || typeof status !== "object" || typeof status.path !== "string") {
    return { state: "unknown", reason: "not a status payload" };
  }
  return { status };
}

/** Probe one row's server. Never throws.
 * @param {HubRow} row @param {ProbeOptions} [options] @returns {Promise<ProbeResult>} */
export async function probeRow(
  row,
  { fetchImpl = fetch, timeoutMs = 1500, realpath = defaultRealpath } = {},
) {
  if (row.project === null) return { state: "unbound" };
  /** @type {{ status: StatusPayload } | ProbeResult} */
  let read;
  try {
    const res = await fetchImpl(`http://127.0.0.1:${row.port}/api/status`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status !== 200) return { state: "unknown", reason: String(res.status) };
    read = await readStatus(res);
  } catch (err) {
    return classifyError(err);
  }
  if (!("status" in read) || !read.status) return /** @type {ProbeResult} */ (read);
  const { status } = read;
  const same = normalize(status.path, realpath) === normalize(row.project, realpath);
  return { state: same ? "on" : "held", status };
}

/** For each row id, the ids of the other rows on the same port.
 * @param {HubRow[]} rows @returns {Map<string, string[]>} */
function portConflicts(rows) {
  /** @type {Map<number, string[]>} */
  const byPort = new Map();
  for (const row of rows) byPort.set(row.port, [...(byPort.get(row.port) ?? []), row.id]);
  /** @type {Map<string, string[]>} */
  const conflicts = new Map();
  for (const ids of byPort.values()) {
    if (ids.length < 2) continue;
    for (const id of ids)
      conflicts.set(
        id,
        ids.filter((other) => other !== id),
      );
  }
  return conflicts;
}

/** Probe every row in parallel; rows sharing a port carry `conflict`.
 * @param {HubRow[]} rows
 * @param {{ probe?: (row: HubRow) => Promise<ProbeResult>, now?: () => Date }} [options]
 * @returns {Promise<{ rows: HubRowStatus[], at: string }>} */
export async function aggregate(rows, { probe = probeRow, now = () => new Date() } = {}) {
  const conflicts = portConflicts(rows);
  const out = await Promise.all(
    rows.map(async (row) => {
      const conflict = conflicts.get(row.id);
      const result = await probe(row);
      return { ...row, ...(conflict ? { conflict } : {}), ...result };
    }),
  );
  return { rows: out, at: now().toISOString() };
}
