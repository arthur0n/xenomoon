// One hub per machine: `npm run hub` serves the hub's JSON surface on 127.0.0.1 (XENOMOON_HUB_PORT,
// default 3110). Before listening it asks the port: a running hub means print its address and exit 0,
// any other holder means exit 1. Nothing is scheduled; the hub only works when asked. Closing it
// never touches a client's server.
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeRowLoader } from "../features/hub/rows.js";
import { aggregate } from "../features/hub/status.js";
import { makeLifecycle } from "../features/hub/lifecycle.js";
import { makeHubHandler, startHubServer } from "../features/hub/server.js";

export const DEFAULT_HUB_PORT = 3110;

/** XENOMOON_HUB_PORT when it is a positive integer, else the default.
 * @param {string | undefined} raw @returns {number} */
export function hubPort(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_HUB_PORT;
}

/** Ask the port who holds it, through the ping route, which does no work (status would wait on
 * project probes, so a stalled project would read as a stranger).
 * @param {string} base @param {typeof fetch} fetchImpl
 * @returns {Promise<"hub" | "free" | "other">} */
async function probePort(base, fetchImpl) {
  /** @type {Response} */
  let res;
  try {
    res = await fetchImpl(`${base}/api/hub/ping`, { signal: AbortSignal.timeout(1000) });
  } catch (err) {
    const cause = /** @type {{ cause?: { code?: unknown } }} */ (err)?.cause;
    return cause?.code === "ECONNREFUSED" ? "free" : "other";
  }
  if (res.status !== 200) return "other";
  try {
    /** @type {unknown} */
    const json = await res.json();
    const body = /** @type {{ hub?: unknown } | null} */ (json);
    return body?.hub === true ? "hub" : "other";
  } catch {
    return "other";
  }
}

/** @param {number} port @returns {string} */
const heldLine = (port) => `port ${port} is held by another server; set XENOMOON_HUB_PORT`;

/** Probe the port before listening; true when the hub must not listen (exit already called).
 * @param {{ port: number, host: string, fetchImpl: typeof fetch, log: (line: string) => void, exit: (code: number) => void }} o
 * @returns {Promise<boolean>} */
async function refusedBeforeListen({ port, host, fetchImpl, log, exit }) {
  const base = `http://${host}:${port}`;
  const holder = await probePort(base, fetchImpl);
  if (holder === "free") return false;
  log(holder === "hub" ? `hub already running at ${base}` : heldLine(port));
  exit(holder === "hub" ? 0 : 1);
  return true;
}

/** SIGINT/SIGTERM close the hub and exit 0; the listeners go away with the server.
 * @param {import("node:http").Server} server @param {(code: number) => void} exit */
function closeOnSignals(server, exit) {
  const stop = () => {
    server.close(() => {
      exit(0);
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  server.once("close", () => {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  });
}

/**
 * @typedef {{
 *   port?: number,
 *   host?: string,
 *   sidecarDir?: string,
 *   registryFile?: string,
 *   log?: (line: string) => void,
 *   exit?: (code: number) => void,
 *   fetchImpl?: typeof fetch,
 *   load?: () => { rows: import("../features/hub/rows.js").HubRow[], errors: import("../features/hub/rows.js").HubError[] },
 * }} HubOptions
 */

/** Start the hub, or report the one already running.
 * @param {HubOptions} [options]
 * @returns {Promise<{ server: import("node:http").Server, address: string } | null>} null when it exited */
export async function runHub({
  port = hubPort(process.env.XENOMOON_HUB_PORT),
  host = "127.0.0.1",
  sidecarDir = path.join(homedir(), ".xenomoon", "hub"),
  registryFile,
  log = console.log,
  exit = process.exit,
  fetchImpl = fetch,
  load = makeRowLoader({ sidecarDir, ...(registryFile ? { registryFile } : {}) }),
} = {}) {
  if (port !== 0 && (await refusedBeforeListen({ port, host, fetchImpl, log, exit }))) return null;
  // ownHost is known only after listen (port 0); the handler reads it per request via this getter.
  let ownHost = `${host}:${port}`;
  const deps = {
    load,
    aggregate,
    lifecycle: makeLifecycle({}),
    get ownHost() {
      return ownHost;
    },
  };
  /** @type {{ server: import("node:http").Server, address: string }} */
  let started;
  try {
    started = await startHubServer({ handler: makeHubHandler(deps), host, port });
  } catch (err) {
    if (/** @type {{ code?: unknown }} */ (err)?.code !== "EADDRINUSE") throw err;
    log(heldLine(port));
    exit(1);
    return null;
  }
  const { server, address } = started;
  ownHost = address.replace(/^http:\/\//, "");
  closeOnSignals(server, exit);
  log(`hub listening at ${address}`);
  return started;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await runHub();
