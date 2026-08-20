// Which Hermes brain and gateway an INSTALL owns.
//
// The install-aware half of the Hermes profile question. `integrations/hermes/hermes-profile.js`
// knows Hermes — how profiles are named and selected, which port a domain starts from — and
// nothing about installs. This module knows installs — the registry, what each one recorded —
// and composes the two. Neither reaches into the other's knowledge.
//
// It sits beside `port-pick.js`, which answers the same question for the UI port: an install
// must OWN what it listens on, and a value derived from the domain alone is shared by every
// install of that domain.
import path from "node:path";
import { readFileSync } from "node:fs";
import { parseJSON } from "../../lib/json.js";
import { readRegistry } from "./install-registry.js";
import { profileFor, freeGatewayPort, portFromUrl } from "../integrations/hermes/hermes-profile.js";

/** Another install's saved Hermes gateway url, read from its own config. Null when it has
 * none — an install that never configured Hermes claims no port.
 * @param {string} dir @returns {string | null} */
export function savedHermesUrl(dir) {
  try {
    const cfg = /** @type {{ hermes?: { apiUrl?: string } }} */ (
      parseJSON(readFileSync(path.join(dir, ".xenomoon.json"), "utf8"))
    );
    return cfg.hermes?.apiUrl ?? null;
  } catch {
    return null;
  }
}

/** Gateway ports already claimed by OTHER installs on this machine.
 * @param {string} selfDir @param {Record<string, unknown>} installs
 * @param {(dir: string) => string | null} [readApiUrl] @returns {number[]} */
export function otherGatewayPorts(selfDir, installs, readApiUrl = savedHermesUrl) {
  const self = path.resolve(selfDir);
  /** @type {number[]} */
  const ports = [];
  for (const dir of Object.keys(installs)) {
    if (path.resolve(dir) === self) continue;
    const port = portFromUrl(readApiUrl(dir));
    if (port !== null) ports.push(port);
  }
  return ports;
}

/** This install's Hermes identity: which brain, and which gateway.
 *
 * Precedence is the same for both — an explicit flag, then what this install already saved
 * (so nothing existing is re-keyed or moved underneath it), then a value derived from the
 * domain and project. Resolved together because they must agree: a per-install brain reached
 * over a shared port is still a shared brain.
 *
 * `installs` defaults to the machine's registry and is injectable, so the rule is testable
 * without a registry file.
 * @param {{ flagProfile?: string, flagPort?: string,
 *   saved?: { profile?: string, apiUrl?: string | null }, domain: string, projectDir: string,
 *   frameworkDir: string, installs?: Record<string, unknown> }} opts
 * @returns {{ profile: string, port: string }} */
export function resolveInstallIdentity(opts) {
  const installs =
    opts.installs ?? /** @type {Record<string, unknown>} */ (readRegistry().installs ?? {});
  const profile =
    opts.flagProfile ?? opts.saved?.profile ?? profileFor(opts.domain, opts.projectDir);
  const port =
    opts.flagPort ??
    String(
      portFromUrl(opts.saved?.apiUrl) ??
        freeGatewayPort(opts.domain, otherGatewayPorts(opts.frameworkDir, installs)),
    );
  return { profile, port };
}
