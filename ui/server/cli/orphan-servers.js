// Servers that outlived their install.
//
// A detached server keeps running when its install directory is deleted or renamed. It holds
// the port and keeps serving the tree it was started from — which no longer exists — so the
// UI shows a project that is gone, and the NEXT install to claim that port finds it taken by
// something no tool can stop: `stop_server` lives inside the install, and the install is what
// vanished. This has now happened twice.
//
// Detection is by CWD, not by port: a process whose working directory is no longer an install
// cannot be serving a valid one, whatever port it holds.
import { execFileSync } from "node:child_process";
import { isInstallDir } from "./install-registry.js";
import { existsSync } from "node:fs";

/** @typedef {{ pid: number, cwd: string }} Listener */

/** Parse `lsof -Fpn` output into processes and their cwd.
 *
 * The field format emits `p<pid>` then one `n<path>` per descriptor, so a `p` line opens a
 * record and the `n` that follows completes it. Parsing the human-readable table instead
 * breaks on any path containing a space.
 * @param {string} out @returns {Listener[]} */
export function parseCwdLines(out) {
  /** @type {Listener[]} */
  const rows = [];
  let pid = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n") && pid !== null) {
      rows.push({ pid, cwd: line.slice(1) });
      pid = null;
    }
  }
  return rows;
}

/** The listeners whose cwd is no longer a framework install.
 *
 * Two shapes, both orphans: the directory is GONE (deleted), or it still exists but is not an
 * install any more (renamed away, or replaced by something else). A live install's server is
 * left strictly alone — this only ever names processes that cannot be doing useful work.
 * @param {Listener[]} listeners
 * @param {(dir: string) => boolean} [isInstall]
 * @param {(dir: string) => boolean} [exists]
 * @returns {Listener[]} */
export function orphans(listeners, isInstall = isInstallDir, exists = existsSync) {
  return listeners.filter(({ cwd }) => !exists(cwd) || !isInstall(cwd));
}

/** The framework's server entry, as it appears on a server's command line. */
const SERVER_ENTRY = "ui/server/core/index.js";

/** Whether a command line is OUR server — the entry as an ARGUMENT, not a substring.
 *
 * "any listening node process" is not an identity test. It matches editors, language servers,
 * MCP servers and bundlers, and this report ends in a `kill` command — so a loose match does
 * not merely cry wolf, it hands someone a line that takes down their tooling. Same rule
 * `stop_server` uses to decide a process is its own: position, not substring.
 * @param {string} args @returns {boolean} */
export function isFrameworkServer(args) {
  const tokens = args.split(/\s+/);
  // argv[0] must be node itself. Otherwise a `sh -c "cd … && node ui/server/core/index.js"`
  // wrapper, a `grep`, or any command that merely MENTIONS the path is reported as a server
  // to kill — and the shell wrapper case is not hypothetical, it showed up the first time
  // this ran for real.
  const exe = tokens[0]?.split("/").pop();
  if (exe !== "node" && exe !== "node.exe") return false;
  return tokens
    .slice(1)
    .some((token) => token === SERVER_ENTRY || token.endsWith(`/${SERVER_ENTRY}`));
}

/** Parse `ps -Ao pid=,args=` output. @param {string} out
 * @returns {{ pid: number, args: string }[]} */
export function parsePs(out) {
  /** @type {{ pid: number, args: string }[]} */
  const rows = [];
  for (const line of out.split("\n")) {
    const m = /^\s*(\d+)\s+(.*\S)\s*$/.exec(line);
    if (m?.[1] && m[2]) rows.push({ pid: Number(m[1]), args: m[2] });
  }
  return rows;
}

/** Every running framework server, with its cwd.
 *
 * Identity comes from `ps` (the command line), and the cwd from `lsof` — two tools because
 * neither gives both. Empty when either is unavailable: a diagnosis that cannot run must not
 * become its own failure.
 * @returns {Listener[]} */
export function listeningServers() {
  try {
    const pids = parsePs(
      execFileSync("ps", ["-Ao", "pid=,args="], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }),
    )
      .filter((p) => isFrameworkServer(p.args))
      .map((p) => String(p.pid));
    if (pids.length === 0) return [];
    return parseCwdLines(
      execFileSync("lsof", ["-p", pids.join(","), "-a", "-d", "cwd", "-Fpn"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }),
    );
  } catch {
    return [];
  }
}

/** The lines doctor prints for orphans — named, with the one command that clears each.
 * `stop_server` is deliberately NOT offered: it resolves the install it lives in, and for an
 * orphan that install is exactly what is missing.
 * @param {Listener[]} found @returns {string[]} */
export function report(found) {
  if (found.length === 0) return [];
  return [
    `doctor: ${found.length} server(s) still running from an install that no longer exists.`,
    ...found.map((o) => `  pid ${o.pid} — was ${o.cwd}`),
    "  They hold their ports and serve a tree that is gone. `stop_server` cannot reach them",
    `  (it lives inside the install). Clear with:  kill ${found.map((o) => o.pid).join(" ")}`,
  ];
}
