// One hub per machine: `npm run hub` serves the hub's JSON surface on 127.0.0.1 (XENOMOON_HUB_PORT,
// default 3110). Before listening it asks the port: a running hub means print its address and exit 0,
// any other holder means exit 1; then it builds the page when stale (a failed build exits 1).
// Its watcher follows each "on" project's status stream; Ctrl+C or
// SIGTERM stops it and ends open streams before the close. Closing it never touches a client's server.
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeRowLoader } from "../features/hub/rows.js";
import { aggregate } from "../features/hub/status.js";
import { makeLifecycle } from "../features/hub/lifecycle.js";
import { ensureHubBuilt } from "../features/hub/build.js";
import {
  closeHub,
  makeHubFeed,
  makeHubHandler,
  makeHubStream,
  startHubServer,
} from "../features/hub/server.js";
import { hooksOffWarning } from "./install-main-guard.js";

/** The framework checkout this file lives in. */
const INSTALL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** @typedef {import("../features/hub/server.js").HubFeed} HubFeed */
/** @typedef {import("../features/hub/server.js").HubStream} HubStream */

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

/** Build the page before listening; true when the build failed (error on stderr, exit 1 called).
 * @param {{ ensureBuilt: () => Promise<unknown>, errLog: (line: string) => void, exit: (code: number) => void }} o
 * @returns {Promise<boolean>} */
export async function buildFailedBeforeListen({ ensureBuilt, errLog, exit }) {
  try {
    await ensureBuilt();
    return false;
  } catch (err) {
    // A HubBuildError's message already carries Vite's output.
    errLog(err instanceof Error ? err.message : String(err));
    exit(1);
    return true;
  }
}

/** The port probe (skipped on port 0), then the page build when `ensureBuilt` is given; true when
 * the hub must not listen (exit already called).
 * @param {Parameters<typeof refusedBeforeListen>[0] & { errLog: (line: string) => void, ensureBuilt: (() => Promise<unknown>) | undefined }} o
 * @returns {Promise<boolean>} */
async function refusedBeforeStart({ ensureBuilt, errLog, ...probe }) {
  if (probe.port !== 0 && (await refusedBeforeListen(probe))) return true;
  return ensureBuilt ? buildFailedBeforeListen({ ensureBuilt, errLog, exit: probe.exit }) : false;
}

/** Listen; a port taken between the probe and listen logs the held line and exits 1 (null).
 * @param {{ handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void, host: string, port: number, log: (line: string) => void, exit: (code: number) => void }} o
 * @returns {Promise<{ server: import("node:http").Server, address: string } | null>} */
async function listenOrRefuse({ handler, host, port, log, exit }) {
  try {
    return await startHubServer({ handler, host, port });
  } catch (err) {
    if (/** @type {{ code?: unknown }} */ (err)?.code !== "EADDRINUSE") throw err;
    log(heldLine(port));
    exit(1);
    return null;
  }
}

/** SIGINT/SIGTERM stop the watcher, end the open streams, close the hub and exit 0. However the
 * server closes, the watcher stops with it and the signal listeners go away.
 * @param {{ server: import("node:http").Server, feed: HubFeed, stream: HubStream }} parts
 * @param {(code: number) => void} exit */
function closeOnSignals(parts, exit) {
  const stop = () => {
    void closeHub(parts).then(() => {
      exit(0);
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  parts.server.once("close", () => {
    parts.feed.stop();
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  });
}

/** One warning line when the install is bound and its git hooks are off.
 * @param {string} installDir @param {(line: string) => void} errLog */
function warnWhenHooksOff(installDir, errLog) {
  const warning = hooksOffWarning(installDir);
  if (warning) errLog(`warning: ${warning}`);
}

/**
 * @typedef {{
 *   port?: number,
 *   host?: string,
 *   sidecarDir?: string,
 *   registryFile?: string,
 *   log?: (line: string) => void,
 *   errLog?: (line: string) => void,
 *   exit?: (code: number) => void,
 *   ensureBuilt?: () => Promise<unknown>,
 *   distDir?: string,
 *   installDir?: string,
 *   fetchImpl?: typeof fetch,
 *   load?: () => { rows: import("../features/hub/rows.js").HubRow[], errors: import("../features/hub/rows.js").HubError[] },
 * }} HubOptions
 */

/** Start the hub, or report the one already running. The page build runs after the port probe (a
 * second hub exits before it) and before listen; without `ensureBuilt` no build runs (the CLI passes it).
 * @param {HubOptions} [options]
 * @returns {Promise<{ server: import("node:http").Server, address: string } | null>} null when it exited */
export async function runHub({
  port = hubPort(process.env.XENOMOON_HUB_PORT),
  host = "127.0.0.1",
  sidecarDir = path.join(homedir(), ".xenomoon", "hub"),
  registryFile,
  log = console.log,
  errLog = console.error,
  exit = process.exit,
  ensureBuilt,
  distDir,
  installDir = INSTALL_DIR,
  fetchImpl = fetch,
  load = makeRowLoader({ sidecarDir, ...(registryFile ? { registryFile } : {}) }),
} = {}) {
  if (await refusedBeforeStart({ port, host, fetchImpl, log, errLog, exit, ensureBuilt }))
    return null;
  // ownHost is known only after listen (port 0); the handler reads it per request via this getter.
  let ownHost = `${host}:${port}`;
  const feed = makeHubFeed({ load, aggregate });
  const stream = makeHubStream(feed);
  const deps = {
    load,
    feed,
    stream,
    lifecycle: makeLifecycle({ load }),
    ...(distDir ? { distDir } : {}),
    get ownHost() {
      return ownHost;
    },
  };
  const started = await listenOrRefuse({ handler: makeHubHandler(deps), host, port, log, exit });
  if (!started) return null;
  const { server, address } = started;
  ownHost = address.replace(/^http:\/\//, "");
  closeOnSignals({ server, feed, stream }, exit);
  void feed.start(); // never rejects; status and stream wait for its first read
  log(`hub listening at ${address}`);
  warnWhenHooksOff(installDir, errLog);
  return started;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await runHub({ ensureBuilt: ensureHubBuilt });
