// Which port an install should own.
//
// A port used to be optional: answer the question with ENTER and nothing was written, so the
// install fell through to the global default at runtime. That is fine with one install and
// wrong with two — both resolve to the same default, and whichever server starts first serves
// the other's UI. It is not a crash, which is what makes it expensive: the wrong project's
// files, sessions and tasks render, and everything looks like it works.
//
// So an install states its port explicitly, and the suggestion avoids ports other REGISTERED
// installs already claim.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../lib/json.js";
import { readRegistry } from "./install-registry.js";

/** The runtime fallback in config.js — the value an install with no saved port lands on. */
export const DEFAULT_PORT = 3117;

/** The port recorded in an install's own config, or null when it never stated one.
 * @param {string} installDir @returns {number | null} */
export function savedPort(installDir) {
  try {
    const cfg = /** @type {{ port?: unknown }} */ (
      parseJSON(readFileSync(path.join(installDir, ".xenomoon.json"), "utf8"))
    );
    return typeof cfg.port === "number" ? cfg.port : null;
  } catch {
    return null;
  }
}

/** Ports claimed by every registered install EXCEPT this one.
 *
 * An install with no saved port still claims the default — that is precisely the port it will
 * use, and pretending it is free is what let a second install take the same one.
 *
 * `installs` is injectable because the registry path is resolved at import time, so a test
 * cannot redirect it afterwards — and a rule this quiet needs to be testable.
 * @param {string} selfDir @param {Record<string, unknown>} [installs] @returns {number[]} */
export function otherInstallPorts(
  selfDir,
  installs = /** @type {Record<string, unknown>} */ (readRegistry().installs ?? {}),
) {
  const self = path.resolve(selfDir);
  /** @type {number[]} */
  const ports = [];
  for (const dir of Object.keys(installs)) {
    if (path.resolve(dir) === self || !existsSync(dir)) continue;
    ports.push(savedPort(dir) ?? DEFAULT_PORT);
  }
  return ports;
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
