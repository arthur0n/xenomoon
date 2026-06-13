// Per-agent color. A curated, well-separated palette assigned on first
// appearance (stable per page load), so several agents running at once stay
// visually distinct — the old hue-hash often put different agents on
// near-identical hues. `main` keeps the ember accent.

/** Distinct on-theme hues, spread ~45° apart. @type {string[]} */
const PALETTE = [
  "oklch(0.78 0.13 85)", // amber
  "oklch(0.76 0.13 150)", // green
  "oklch(0.78 0.1 210)", // cyan
  "oklch(0.74 0.12 255)", // blue
  "oklch(0.74 0.13 300)", // violet
  "oklch(0.74 0.15 345)", // magenta
  "oklch(0.71 0.16 25)", // red
  "oklch(0.8 0.15 125)", // lime
];

/** name -> assigned color, in first-seen order. @type {Map<string, string>} */
const assigned = new Map();
let nextIdx = 0;

/** @param {string} name @returns {string} */
export function agentColor(name) {
  if (name === "main") return "var(--accent-text)";
  let color = assigned.get(name);
  if (!color) {
    color = PALETTE[nextIdx % PALETTE.length] ?? "var(--accent-text)";
    nextIdx++;
    assigned.set(name, color);
  }
  return color;
}

/** @param {HTMLElement} node @param {string} agent @returns {HTMLElement} */
export function paint(node, agent) {
  node.dataset.agent = agent;
  node.style.setProperty("--agent-color", agentColor(agent));
  return node;
}
