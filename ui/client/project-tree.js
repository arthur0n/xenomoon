// Project state sidebar — the collapsible tree of design docs, library,
// scenes, scripts, agents and skills, scanned live from /api/state.
import { $, el } from "./dom.js";
import { fetchJSON, parseJSON } from "../lib/json.js";
import { view } from "./state.js";

const COLLAPSE_KEY = "xenodot-collapsed";
/** @type {Record<string, boolean>} */
const collapsed = (() => {
  try {
    return /** @type {Record<string, boolean>} */ (
      parseJSON(localStorage.getItem(COLLAPSE_KEY) ?? "{}")
    );
  } catch {
    return {};
  }
})();

export async function loadState() {
  const s = /** @type {import("../lib/types.js").ProjectState} */ (await fetchJSON("/api/state"));
  view.projectDir = s.dir;
  $("proj-name").textContent = s.name;
  $("proj-path").textContent = s.dir.replace(/^\/Users\/[^/]+/, "~");
  const tree = $("project-tree");
  tree.replaceChildren();

  /**
   * @template T
   * @param {string} label
   * @param {T[]} items
   * @param {(it: T) => HTMLElement} render
   */
  const group = (label, items, render) => {
    const g = el("div", "tree-group");
    if (collapsed[label] ?? true) g.classList.add("collapsed"); // collapsed by default
    const head = el("div", "tree-group-head");
    head.append(el("span", "chev", "▾"), ` ${label} `, el("span", "count", String(items.length)));
    head.onclick = () => {
      g.classList.toggle("collapsed");
      collapsed[label] = g.classList.contains("collapsed");
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
      } catch {}
    };
    g.append(head);
    if (!items.length) g.append(el("div", "tree-empty", "none yet"));
    else
      items.forEach((it) => {
        g.append(render(it));
      });
    tree.append(g);
  };

  group("Design docs", s.designDocs, (d) => {
    const item = el("div", "tree-item", d.path + " ");
    item.append(el("span", "desc", `— ${d.title}`));
    return item;
  });
  group("Addon library", s.library ?? [], (d) => {
    const item = el("div", "tree-item");
    if (d.verdict) {
      const v = d.verdict.toLowerCase();
      const dot = el("span", "verdict-dot", "●");
      dot.style.color = v.startsWith("adopted")
        ? "var(--green)"
        : v.startsWith("rejected")
          ? "var(--red)"
          : "var(--amber)";
      dot.title = d.verdict;
      item.append(dot, " ");
    }
    item.append(d.title + " ", el("span", "desc", `— ${d.verdict ?? "researching…"}`));
    return item;
  });
  group("Scenes", s.scenes, (f) => el("div", "tree-item", f));
  group("Scripts", s.scripts, (f) => el("div", "tree-item", f));
  group("Agents", s.agents, (a) => {
    const item = el("div", "tree-item", a.name + " ");
    if (a.model) item.append(el("span", "desc", `(${a.model})`));
    return item;
  });
  group("Skills", s.skills, (f) => el("div", "tree-item", f));
}
