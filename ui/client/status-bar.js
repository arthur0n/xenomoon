// Running-agent status bar — shows the active sub-agent and an elapsed timer.
import { $ } from "./dom.js";
import { paint } from "./agents.js";

/** @type {ReturnType<typeof setInterval> | undefined} */
let elapsedTimer;

/** @param {string} agent @param {string} [target] */
export function showRunning(agent, target) {
  paint($("status-agent"), agent).textContent = agent;
  $("status-target").textContent = target ?? "";
  $("status-bar").style.display = "";
  let seconds = 0;
  clearInterval(elapsedTimer);
  $("status-elapsed").textContent = "0s";
  elapsedTimer = setInterval(() => {
    seconds++;
    const mm = Math.floor(seconds / 60);
    $("status-elapsed").textContent = mm ? `${mm}m ${seconds % 60}s` : `${seconds}s`;
  }, 1000);
}

export function hideRunning() {
  clearInterval(elapsedTimer);
  $("status-bar").style.display = "none";
}
