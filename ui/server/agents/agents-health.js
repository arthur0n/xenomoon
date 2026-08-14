// Background health sweeps for the external-agent registry — the ACTIVE half of the
// probes. `listAgents()` stays cheap on purpose (no probes on GET /api/agents), so the
// live warning the rail strip paints comes from HERE: a periodic background sweep runs
// each enabled agent's check and caches the verdict, and `listAgentsWithHealth()` serves
// the cached copy alongside the catalog. Born from a real outage: a Hermes gateway that
// was green on reachability but had NO web search backend produced uncited research for
// days, because the only place the caveat showed was a Test button nobody had reason to
// click. Now the ⚠ finds the user instead.
import { AGENT_REGISTRY, listAgents } from "./registry.js";

/** How often the background sweep re-probes enabled agents. Checks are local + cheap
 * (HTTP to a localhost gateway / a CLI probe), but not free — 10 min keeps the strip
 * honest without background churn. */
const SWEEP_INTERVAL_MS = 10 * 60_000;
/** Delay before the boot sweep — lets the server finish binding first. */
const BOOT_DELAY_MS = 5_000;

/** One cached verdict. `ok`/`caveat`/`error` mirror the agent's own check shape.
 * @typedef {{ ok: boolean, caveat?: string, error?: string, checkedAt: number }} AgentHealth */

/** @type {Map<string, AgentHealth>} */
const healthCache = new Map();
let sweeping = false;

/** Probe every ENABLED agent sequentially (checks may spawn CLIs — no parallel storms)
 * and refresh the cache. Disabled agents get their stale entry dropped instead of a
 * probe: "off" needs no health. Never throws. */
export async function sweepAgentHealth() {
  if (sweeping) return; // one sweep at a time; the interval will come around again
  sweeping = true;
  try {
    for (const agent of AGENT_REGISTRY) {
      if (agent.publicConfig().enabled !== true) {
        healthCache.delete(agent.id);
        continue;
      }
      /** @type {AgentHealth} */
      let health;
      try {
        const v = /** @type {{ ok?: boolean, caveat?: string, error?: string }} */ (
          await agent.check({})
        );
        health = {
          ok: v.ok === true,
          ...(v.caveat ? { caveat: v.caveat } : {}),
          ...(v.error ? { error: v.error } : {}),
          checkedAt: Date.now(),
        };
      } catch (e) {
        health = {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          checkedAt: Date.now(),
        };
      }
      healthCache.set(agent.id, health);
    }
  } finally {
    sweeping = false;
  }
}

/** Kick the periodic sweeps: one shortly after boot, then every SWEEP_INTERVAL_MS.
 * Timers are unref'd — they never keep the process alive. */
export function startHealthSweeps() {
  setTimeout(() => void sweepAgentHealth(), BOOT_DELAY_MS).unref();
  setInterval(() => void sweepAgentHealth(), SWEEP_INTERVAL_MS).unref();
}

/** Re-probe soon after a config change (enable/disable, new key) so the strip doesn't
 * show a stale verdict for up to 10 minutes. Fire-and-forget. */
export function triggerHealthSweep() {
  setTimeout(() => void sweepAgentHealth(), 500).unref();
}

/** GET /api/agents payload: the registry catalog + each agent's cached health verdict
 * (absent until the first sweep touches it). */
export function listAgentsWithHealth() {
  return listAgents().map((d) => {
    const health = healthCache.get(d.id);
    return health ? { ...d, health } : d;
  });
}
