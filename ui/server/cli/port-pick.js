// Which port an install should own.
//
// A port used to be optional: answer the question with ENTER and nothing was written, so the
// install fell through to the global default at runtime. That is fine with one install and
// wrong with two — both resolve to the same default, and whichever server starts first serves
// the other's UI. It is not a crash, which is what makes it expensive: the wrong project's
// files, sessions and tasks render, and everything looks like it works.
//
// So an install states its port explicitly, and the suggestion avoids ports REGISTERED installs
// and their projects already claim.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../lib/json.js";
import { readRegistry } from "./install-registry.js";
import { readProfiles, salvageProfiles } from "./profiles.js";

/** The runtime fallback in config.js — the value an install with no saved port lands on. */
export const DEFAULT_PORT = 3117;

/** File access the port rules use, injectable so tests never touch real install files.
 * @typedef {{ readFile?: (file: string) => string, exists?: (dir: string) => boolean }} PortDeps */

/** The port recorded in an install's own config, or null when it never stated one.
 * @param {string} installDir @param {PortDeps} [deps] @returns {number | null} */
export function savedPort(installDir, { readFile = (f) => readFileSync(f, "utf8") } = {}) {
  try {
    const cfg = /** @type {{ port?: unknown }} */ (
      parseJSON(readFile(path.join(installDir, ".xenomoon.json")))
    );
    return typeof cfg.port === "number" ? cfg.port : null;
  } catch {
    return null;
  }
}

/** An install whose project ports are not fully known: its file exists but parseProfiles
 * refuses it. @typedef {{ install: string, file: string, reason: string }} PortProblem */

/** Every port the given installs claim: each install's root port, plus the port of every one of
 * its projects (the `projects` map of its .xenomoon.json). An install with no saved root port
 * still claims the default — that is precisely the port it will use, and pretending it is free
 * is what let a second install take the same one. A project with no port claims nothing. An
 * install whose directory is gone claims nothing; a missing file is an install with no projects.
 *
 * An install file that parseProfiles refuses is a `problem` (#65): its claims are unknown, so a
 * caller that allocates a NEW port must refuse (allocationRefusal). Every entry whose own port is
 * a positive integer still claims it (profiles.js salvageProfiles), so display-only readers keep
 * seeing it.
 *
 * `installs` defaults to the registry itself: readRegistry() RETURNS the installs map (#79 read
 * `.installs` off it, got undefined, and so never saw another install's port).
 * @param {Record<string, unknown>} [installs] @param {PortDeps} [deps]
 * @returns {{ ports: number[], problems: PortProblem[] }} */
export function portClaims(installs = readRegistry(), deps = {}) {
  const exists = deps.exists ?? existsSync;
  const live = Object.keys(installs)
    .filter((dir) => exists(dir))
    .sort();
  const roots = live.map((dir) => savedPort(dir, deps) ?? DEFAULT_PORT);
  /** @type {number[]} */
  const projects = [];
  /** @type {PortProblem[]} */
  const problems = [];
  for (const dir of live) {
    const parsed = readProfiles(dir, deps);
    if (!parsed.ok) {
      const file = path.join(path.resolve(dir), ".xenomoon.json");
      problems.push({ install: path.resolve(dir), file, reason: parsed.reason });
    }
    for (const e of salvageProfiles(dir, deps)?.entries ?? []) if (e.port) projects.push(e.port);
  }
  return { ports: [...roots, ...projects], problems };
}

/** The ports of portClaims alone — for readers that only display or compare ports.
 * @param {Record<string, unknown>} [installs] @param {PortDeps} [deps] @returns {number[]} */
export function claimedPorts(installs = readRegistry(), deps = {}) {
  return portClaims(installs, deps).ports;
}

/** Why no NEW port may be allocated while `installDir` and the registered installs are as they
 * are, or null when it may: an install file whose project list cannot be read hides ports that
 * real projects own, and guessing would hand one of them out again. Names every file to fix.
 * @param {string} installDir @param {Record<string, unknown>} [installs] @param {PortDeps} [deps]
 * @returns {string | null} */
export function allocationRefusal(installDir, installs = readRegistry(), deps = {}) {
  const self = path.resolve(installDir);
  const all = Object.fromEntries(Object.keys(installs).map((d) => [path.resolve(d), null]));
  const { problems } = portClaims({ ...all, [self]: null }, deps);
  if (problems.length === 0) return null;
  const files = problems.map((p) => `${p.file} (${p.reason})`).join("; ");
  return (
    `cannot pick a port: the project list in ${files} cannot be read, so the ports its ` +
    `projects own are unknown. Fix that file, then run the command again.`
  );
}

/** Ports claimed by every registered install EXCEPT this one — for choosing this install's own
 * root port. `installs` and `deps` are injectable so the rule is testable without a registry.
 * @param {string} selfDir @param {Record<string, unknown>} [installs] @param {PortDeps} [deps]
 * @returns {number[]} */
export function otherInstallPorts(selfDir, installs = readRegistry(), deps = {}) {
  const self = path.resolve(selfDir);
  const others = Object.entries(installs).filter(([dir]) => path.resolve(dir) !== self);
  return claimedPorts(Object.fromEntries(others), deps);
}

/** The port to offer a NEW project of `installDir`: the first port at or above `from` that no
 * install claims — this install's own root port and its other projects' ports included, so a
 * second project is never offered the first project's port.
 * @param {string} installDir @param {number} [from] @param {Record<string, unknown>} [installs]
 * @param {PortDeps} [deps] @returns {number} */
export function suggestProjectPort(
  installDir,
  from = DEFAULT_PORT,
  installs = readRegistry(),
  deps = {},
) {
  const withSelf = { ...installs, [path.resolve(installDir)]: null };
  return firstFreePort(from, claimedPorts(withSelf, deps));
}

/** The first port at or above `from` that nothing in `taken` claims.
 * @param {number} from @param {number[]} taken @returns {number} */
export function firstFreePort(from, taken) {
  const claimed = new Set(taken);
  let port = from;
  // Bounded so a pathological registry cannot spin: past this, the machine has bigger problems.
  for (let i = 0; i < 1000 && claimed.has(port); i++) port += 1;
  return port;
}
