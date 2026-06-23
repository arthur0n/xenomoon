// The engine-binary probe — kept side-effect-free so both config.js (which has load-time side
// effects) and the hermetic onboarding.check.js can share it without coupling. This is a deferred
// seam: only domains whose descriptor declares engine.needsBinary (a binary-backed engine like the
// upstream Godot product and its CLI-compatible relatives — Redot / Blazium share one CLI) call
// this; the webapp / Node runtime drives its toolchain through package scripts and needs no
// `$GODOT`-style binary at all, so this probe degrades to an unused no-op for it.
import { execFileSync } from "node:child_process";

/** Resolve the engine executable (a deferred seam for binary-backed engines like the upstream Godot
 * product). Probes, in order: `$GODOT`, the macOS app bundle, the engine name on PATH, then `godot`
 * — each validated with `--version` so a stale/missing candidate is skipped. Returns the first that
 * runs, or null. The reference engine's CLI-compatible relatives (Redot/Blazium) share the CLI, so
 * passing their name lets them resolve on PATH unchanged. Callers gate on engine.needsBinary first.
 * @param {string} [name] engine name to also try on PATH (e.g. "godot", "redot")
 * @returns {string | null} */
export function resolveEngineBin(name = "godot") {
  const candidates = [
    process.env.GODOT,
    "/Applications/Godot.app/Contents/MacOS/Godot",
    name,
    "godot",
  ].filter((c) => typeof c === "string" && c.length > 0);
  for (const c of candidates) {
    try {
      execFileSync(/** @type {string} */ (c), ["--version"], { stdio: "ignore" });
      return /** @type {string} */ (c);
    } catch {
      // try next candidate
    }
  }
  return null;
}
