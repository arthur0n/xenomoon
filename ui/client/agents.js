// Per-agent color. The name hash picks ONLY the hue; saturation/lightness come
// from the --agent-s / --agent-l tokens in :root, so agents stay on-palette.

/** @param {string} name @returns {string} */
export function agentColor(name) {
  if (name === "main") return "var(--accent-text)";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return "hsl(" + (h % 360) + " var(--agent-s) var(--agent-l))";
}

/** @param {HTMLElement} node @param {string} agent @returns {HTMLElement} */
export function paint(node, agent) {
  node.dataset.agent = agent;
  node.style.setProperty("--agent-color", agentColor(agent));
  return node;
}
