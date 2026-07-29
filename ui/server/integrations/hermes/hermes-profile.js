// Per-DOMAIN Hermes profiles — ONE source of truth for where a profile's brain lives and
// how to reach it. Hermes' SOUL/memory/skills are global per home dir; sharing `~/.hermes`
// across godot (upstream) and xenomoon domains poisons personas and starves the tiny
// memory budget. So: each xenomoon domain gets its own NATIVE Hermes profile
// (`~/.hermes/profiles/<name>` — the layout `hermes profile create` scaffolds and the
// Hermes source recognizes), selected PER SPAWN via the `HERMES_HOME` env var (highest
// precedence in Hermes' resolution; deliberately never persisted — it's on Hermes' own
// env-writer denylist). We NEVER run `hermes profile use` (sticky — it would flip the
// godot side's default profile too).
//
// Profile "default" = the legacy shared `~/.hermes`: no env override, byte-identical
// behavior to before — that home stays the exclusive property of the godot/upstream side.
import path from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

/** Per-domain default gateway ports. Distinct on purpose: the gateway starter probes the
 * configured URL and REUSES any answering gateway, so two profiles on one port would make
 * a domain silently talk to another brain's gateway. `--port` still overrides. */
const DOMAIN_GATEWAY_PORTS = /** @type {Record<string, number>} */ ({
  webapp: 8643,
  expo: 8644,
  app: 8645,
});

/** The default gateway port for a profile (8642 = the legacy/default profile).
 * @param {string} profile @returns {number} */
export function defaultGatewayPort(profile) {
  return DOMAIN_GATEWAY_PORTS[profile] ?? 8642;
}

/** Absolute home dir for a profile, or null for the legacy default (`~/.hermes`, no
 * override). @param {string} profile @returns {string | null} */
export function hermesHome(profile) {
  if (!profile || profile === "default") return null;
  return path.join(homedir(), ".hermes", "profiles", profile);
}

/** Spawn env for a hermes CLI/gateway invocation under this profile. The default profile
 * returns process.env untouched. @param {string} profile @returns {NodeJS.ProcessEnv} */
export function hermesEnv(profile) {
  const home = hermesHome(profile);
  return home ? { ...process.env, HERMES_HOME: home } : process.env;
}

/** The `HERMES_HOME=…` prefix for a manual terminal command under this profile ("" for
 * the default profile). @param {string} profile @returns {string} */
export function hermesEnvPrefix(profile) {
  const home = hermesHome(profile);
  return home ? `HERMES_HOME="${home}" ` : "";
}

/** Make sure the profile exists (scaffolded by the hermes CLI itself). No-op for the
 * default profile or when the dir is already there. Never `profile use` — selection is
 * per-spawn env only. @param {string} profile @returns {{ ok: boolean, error?: string }} */
export function ensureProfile(profile) {
  const home = hermesHome(profile);
  if (!home || existsSync(home)) return { ok: true };
  const r = spawnSync("hermes", ["profile", "create", profile], { encoding: "utf8" });
  if (r.status === 0 || existsSync(home)) return { ok: true };
  return {
    ok: false,
    error: `hermes profile create ${profile} failed: ${(r.stderr || r.stdout || "").trim() || `exit ${r.status}`}`,
  };
}
