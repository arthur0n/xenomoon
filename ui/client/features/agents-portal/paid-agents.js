// Paid agents — the always-visible rail strip answering "which BILLED external agents are
// active right now?". Every entry of GET /api/agents is an agent that spends the user's
// own money on its own account (Hermes → provider/Nous billing, Codex → OpenAI/ChatGPT,
// Kimi → Moonshot, …), so unlike the built-in roster they must never be silently on —
// this strip keeps that state one glance away, outside the Settings modal. Data-driven
// from the same registry the portal renders: a future agent needs NO edit here.
// Clicking the strip opens Settings (the portal owns connect/enable/test).
import { $, el } from "../../core/dom.js";
import { fetchJSON } from "../../../lib/json.js";

/** @typedef {import("../../../lib/types.js").AgentPublicDescriptor} AgentDescriptor */

/** Re-fetch the registry and repaint the strip. Section stays hidden until the first
 * successful fetch with a non-empty catalog (older servers without /api/agents → hidden). */
export async function refreshPaidAgents() {
  const section = $("paid-agents");
  const list = $("paid-agents-list");
  if (!section || !list) return;
  /** @type {AgentDescriptor[]} */
  let agents;
  try {
    agents = /** @type {AgentDescriptor[]} */ (await fetchJSON("/api/agents"));
  } catch {
    return; // endpoint missing/unreachable — leave the strip as it was
  }
  if (!Array.isArray(agents) || agents.length === 0) return;

  let warns = 0;
  list.replaceChildren(
    ...agents.map((a) => {
      const on = a.status?.enabled === true;
      // Server-side background sweep verdict (agents-health.js): an enabled agent that is
      // unreachable OR degraded (ok with a caveat, e.g. Hermes up but no web search
      // backend) gets a live ⚠ — the user must not need to click Test to learn this.
      const problem = on && a.health ? (a.health.caveat ?? a.health.error) : undefined;
      if (problem) warns++;
      const row = el("div", `paid-agent-row${on ? " on" : ""}${problem ? " warn" : ""}`);
      if (problem) row.title = problem;
      row.append(
        el("span", `dot${on ? (problem ? " warn" : "") : " idle"}`),
        el("span", "paid-agent-name", a.label),
        el(
          "span",
          "paid-agent-state",
          on
            ? problem
              ? "⚠ needs attention"
              : a.status.roles?.length
                ? a.status.roles.join(" · ")
                : "active"
            : "off",
        ),
      );
      return row;
    }),
  );
  const onCount = agents.filter((a) => a.status?.enabled === true).length;
  const badge = $("paid-agents-badge");
  if (badge) badge.textContent = `${onCount}/${agents.length}${warns ? " ⚠" : ""}`;
  section.style.display = "";
}

/** How often the strip re-polls /api/agents — picks up the server's background health
 * sweeps (first lands seconds after boot, then every 10 min) without a manual reload. */
const REFRESH_INTERVAL_MS = 2 * 60_000;

/** Boot: first paint + a slow poll for health updates + click-through to Settings
 * (where the portal cards live). */
export function initPaidAgents() {
  const section = $("paid-agents");
  if (section)
    section.onclick = () => {
      $("settings-btn")?.click();
    };
  void refreshPaidAgents();
  // Early re-paint so the boot sweep's verdict shows quickly, then the slow poll.
  setTimeout(() => void refreshPaidAgents(), 15_000);
  setInterval(() => void refreshPaidAgents(), REFRESH_INTERVAL_MS);
}
