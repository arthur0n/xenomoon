// The Pulse LED — a pure subscriber, like autonomous.js: the server owns the state and
// round-trips it back, so the indicator can never desync from what Pulse is actually doing.
//
// The LED is load-bearing, not decoration. Pulse is deliberately quiet (a flat beat injects
// nothing at all), so without a visible light there is no way to tell "watching, nothing to
// report" from "switched off" — and a silent safety net nobody can see is one nobody trusts.
import { getState, subscribe } from "../../core/store.js";
import { send } from "../../core/websocket.js";
import { $ } from "../../core/dom.js";

/** @typedef {Omit<import("../../../lib/types.js").Pulse, "seen">} PulseView */

/** Human-readable "when", short enough for a pill. @param {string | null} iso @returns {string} */
function ago(iso) {
  if (!iso) return "never";
  const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (secs < 90) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  return mins < 90 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
}

/** Paint the LED from the pulse slice. @param {PulseView} p */
function renderLed(p) {
  const btn = $("pulse-btn");
  const label = $("pulse-label");
  const dot = $("pulse-dot");
  if (!btn || !label || !dot) return;

  // `degraded` outranks everything except off: a sweep whose checks could not RUN must never
  // render as calm. Reporting "armed, nothing found" while blind is the failure this state exists
  // to make impossible.
  const state = !p.active
    ? "off"
    : p.lastError
      ? "degraded"
      : p.sleeping
        ? "sleeping"
        : p.found > 0
          ? "found"
          : "armed";
  btn.classList.toggle("on", p.active && !p.sleeping && state !== "degraded");
  btn.classList.toggle("found", state === "found");
  btn.classList.toggle("sleeping", state === "sleeping");
  btn.classList.toggle("degraded", state === "degraded");
  dot.classList.toggle("beating", state === "armed" || state === "found");
  label.textContent = `Pulse: ${state}`;

  // The tooltip carries the observability the LED can't: why it last fired, what it suppressed,
  // when it beats next, and any check that failed.
  btn.title = !p.active
    ? "Pulse is off — nothing is watching for work that hasn't landed. Click to arm."
    : [
        // Lead with the failure when degraded — "armed, nothing found" must never be the first
        // thing you read off a sweep that never ran.
        p.lastError ? `⚠ DEGRADED — a check could not run: ${p.lastError}` : "",
        p.lastError ? "findings below are INCOMPLETE, not a clean bill of health" : "",
        `Pulse ${state} · ${p.beats} beat(s)`,
        `last beat ${ago(p.lastBeatAt)}${p.found ? ` — ${p.found} new` : ""}`,
        p.suppressed ? `${p.suppressed} unchanged (suppressed)` : "nothing suppressed",
        p.sleeping
          ? "sleeping after quiet beats — any message wakes it"
          : `next beat ${p.nextBeatAt ? ago(p.nextBeatAt).replace(" ago", " from now") : "—"}`,
      ]
        .filter(Boolean)
        .join("\n");
}

/** Toggle Pulse. Zero-config by design: no goal to author, so a click is the whole interaction. */
function toggle() {
  send({ type: "pulse_mode", action: getState().pulse.active ? "stop" : "start" });
}

export function initPulse() {
  $("pulse-btn")?.addEventListener("click", toggle);
  subscribe("pulse", renderLed);
  renderLed(getState().pulse);
}
