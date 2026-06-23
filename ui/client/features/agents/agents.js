// Per-agent color. A curated, well-separated palette assigned on first
// appearance (stable per page load), so several agents running at once stay
// visually distinct — the old hue-hash often put different agents on
// near-identical hues. `main` keeps the bronze accent.

/** Distinct on-theme hues that skip the green band entirely — warm bronzes
 *  and cold steels, the two poles of the emblem. @type {string[]} */
const PALETTE = [
  "oklch(0.79 0.12 60)", // amber-orange
  "oklch(0.81 0.12 90)", // moon gold
  "oklch(0.76 0.085 195)", // teal steel
  "oklch(0.78 0.1 225)", // sky steel
  "oklch(0.74 0.12 262)", // blue
  "oklch(0.74 0.13 300)", // violet
  "oklch(0.74 0.15 340)", // magenta
  "oklch(0.71 0.16 25)", // iron red
];

/** name -> assigned color, in first-seen order. @type {Map<string, string>} */
const assigned = new Map();
let nextIdx = 0;

// Fixed identity colors for the known cast. A given Xenomoon reads as the SAME
// hue everywhere it appears — chat avatar, activity log, running strip, and the
// task board's owner stamp — so you can track one agent across panels by color
// alone. Hues are pulled from PALETTE above so the cast stays on-theme; only
// the casting is opinionated (the Developer works the hot iron, so amber;
// Triage diagnoses, so iron red; …). `main` keeps the bronze accent below.
// Agents outside this map still draw from the rotating PALETTE.
/** @type {Record<string, string>} */
const ROLE_COLOR = {
  "senior-dev": "oklch(0.74 0.13 300)", // violet — solution design
  developer: "oklch(0.79 0.12 60)", // amber — hot iron, the implementer
  "bug-triage": "oklch(0.71 0.16 25)", // iron red — triage & diagnosis
  "skill-researcher": "oklch(0.81 0.12 90)", // moon gold — the library
  "transcript-researcher": "oklch(0.74 0.15 340)", // magenta — raw signal
  hermes: "#3b2aff", // electric indigo — the external Hermes researcher (not a Xenomoon)
};

/** Strip "namespace:" prefix from a plugin-namespaced agent id.
 *  "xenomoon:game-designer" → "game-designer", "hermes" → "hermes"
 * @param {string} name @returns {string} */
function stripNs(name) {
  if (!name) return name;
  const i = name.indexOf(":");
  return i === -1 ? name : name.slice(i + 1);
}

// Display-name (brand) map: identifier -> what the user sees. Brand first
// ("Xenomoon <role>"), so every agent reads as one of our Xenomoons. Pure UI
// flavor — the SDK identifiers (subagent_type) and agent filenames stay literal
// so routing keeps working. Only the rendered text changes.
//   main -> Xenomoon Hive, addon-researcher -> Xenomoon Researcher, etc.
/** @type {Record<string, string>} */
const DISPLAY = {
  main: "Xenomoon Hive",
  "bug-triage": "Xenomoon Triage",
  "senior-dev": "Xenomoon Senior",
  developer: "Xenomoon Developer",
  "skill-researcher": "Xenomoon Researcher",
  "cli-researcher": "Xenomoon CLI Researcher",
  "transcript-researcher": "Xenomoon Transcript",
  "handoff-summarizer": "Xenomoon Handoff",
  hermes: "Hermes: Researcher",
  "codex-rescue": "Codex: Reviewer",
};

/** @param {string} name @returns {string} */
export function agentLabel(name) {
  if (!name) return name;
  if (DISPLAY[name]) return DISPLAY[name];
  const bare = stripNs(name);
  if (DISPLAY[bare]) return DISPLAY[bare];
  // Fallback for any agent not in the map: brand first, dashes to spaces.
  const role = bare.replace(/-/g, " ");
  const titled = role.replace(/\b\w/g, (c) => c.toUpperCase());
  return `Xenomoon ${titled}`;
}

/** The avatar/initial for an agent: the first word of its display name that
 * isn't "Xenomoon" — so "Xenomoon Hive" reads "H" and "Xenomoon Designer" reads "D".
 * @param {string} name @returns {string} */
export function agentInitial(name) {
  const word = agentLabel(name)
    .split(" ")
    .find((w) => w && w !== "Xenomoon");
  return (word ?? agentLabel(name)).charAt(0).toUpperCase();
}

/** The agent's role, brand prefix dropped — "Xenomoon Developer" -> "Developer",
 * "main" -> "Hive". For tight spots (the task board's owner stamp) where the
 * "Xenomoon" brand is already implied by the surrounding UI. @param {string} name @returns {string} */
export function agentRole(name) {
  return agentLabel(name).replace(/^Xenomoon\s+/, "") || agentLabel(name);
}

/** @param {string} name @returns {string} */
export function agentColor(name) {
  if (name === "main") return "var(--accent-text)";
  const bare = stripNs(name);
  if (ROLE_COLOR[bare]) return ROLE_COLOR[bare];
  let color = assigned.get(bare);
  if (!color) {
    color = PALETTE[nextIdx % PALETTE.length] ?? "var(--accent-text)";
    nextIdx++;
    assigned.set(bare, color);
  }
  return color;
}

/** @param {HTMLElement} node @param {string} agent @returns {HTMLElement} */
export function paint(node, agent) {
  node.dataset.agent = stripNs(agent);
  node.style.setProperty("--agent-color", agentColor(agent));
  return node;
}
