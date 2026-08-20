// Which domain pack a project looks like, from evidence in the project itself.
//
// The question used to be `Domain for this project (expoapp | webapp):` — two bare words, no
// statement of what either means or how to tell which fits. Yet the answer is usually visible
// in the project's own manifest: an Expo app declares `expo`, a web app does not. So detect,
// put the match first, and SAY what the evidence was — a recommendation you can check beats a
// default you cannot.
//
// A guess is never silent and never final: the human still picks, and the detection only
// decides the ORDER.
//
// Pure: the caller reads the files.

/** @typedef {{ id: string, why: string } | null} Detection */

/** The pack a project's manifest points at, with the evidence for it.
 *
 * Expo before web on purpose: an Expo app IS a React app, so react/react-dom prove nothing on
 * their own, while `expo` or `react-native` is decisive. Checking web first would claim every
 * Expo project.
 * @param {{ dependencies?: Record<string, string>, devDependencies?: Record<string, string> }} pkg
 * @param {string[]} files names in the project root
 * @returns {Detection} */
export function detect(pkg, files) {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const has = /** @param {string} d */ (d) => Object.hasOwn(deps, d);

  if (has("expo")) return { id: "expoapp", why: "`expo` in package.json" };
  if (has("react-native")) return { id: "expoapp", why: "`react-native` in package.json" };
  const appConfig = files.find((f) => /^app\.(json|config\.[jt]s)$/.test(f));
  if (appConfig) return { id: "expoapp", why: `${appConfig} in the project root` };

  if (has("next")) return { id: "webapp", why: "`next` in package.json" };
  if (has("react")) return { id: "webapp", why: "`react` in package.json" };
  if (has("express") || has("fastify") || has("hono"))
    return { id: "webapp", why: "a Node HTTP server in package.json" };
  return null;
}

/** Available domains ordered with the detected one first, so empty selects the match.
 * @param {{ id: string, summary: string, detail?: string }[]} items
 * @param {Detection} detected
 * @returns {{ id: string, summary: string, detail?: string }[]} */
export function order(items, detected) {
  if (!detected) return items;
  const match = items.find((i) => i.id === detected.id);
  return match ? [match, ...items.filter((i) => i !== match)] : items;
}

/** A domain descriptor's first sentence — the whole thing is a paragraph, and a picklist row
 * is one line. Falls back to the label when there is no description.
 * @param {{ label?: string, description?: string }} domain @returns {string} */
export function summarize(domain) {
  const text = (domain.description ?? "").trim();
  if (!text) return domain.label ?? "";
  const first = /^(.*?[.!?])(\s|$)/.exec(text)?.[1] ?? text;
  return first.length > 120 ? `${first.slice(0, 117).trimEnd()}…` : first;
}
