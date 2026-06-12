// Panel resize — drag the seams; widths persist to localStorage.
import { $ } from "./dom.js";
import { parseJSON } from "../lib/json.js";

const rootStyle = document.documentElement.style;
const LS_KEY = "xenodot-panel-widths";

/** Apply any saved panel widths on startup. */
export function restorePanelWidths() {
  try {
    const saved = /** @type {{ sidebar?: number, activity?: number }} */ (
      parseJSON(localStorage.getItem(LS_KEY) ?? "{}")
    );
    if (saved.sidebar) rootStyle.setProperty("--sidebar-w", saved.sidebar + "px");
    if (saved.activity) rootStyle.setProperty("--activity-w", saved.activity + "px");
  } catch {}
}

function persistWidths() {
  const cs = getComputedStyle(document.documentElement);
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        sidebar: parseInt(cs.getPropertyValue("--sidebar-w")) || 252,
        activity: parseInt(cs.getPropertyValue("--activity-w")) || 356,
      }),
    );
  } catch {}
}

/**
 * @param {string} id
 * @param {string} cssVar
 * @param {"left" | "right"} side
 * @param {number} min
 * @param {number} max
 */
export function setupResizer(id, cssVar, side, min, max) {
  const node = $(id);
  if (!node) return;
  node.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    node.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing");
    /** @param {PointerEvent} ev */
    const onMove = (ev) => {
      const w = side === "left" ? ev.clientX : window.innerWidth - ev.clientX;
      rootStyle.setProperty(cssVar, Math.max(min, Math.min(max, w)) + "px");
    };
    /** @param {PointerEvent} ev */
    const onUp = (ev) => {
      node.releasePointerCapture(ev.pointerId);
      document.body.classList.remove("resizing");
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerup", onUp);
      persistWidths();
    };
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerup", onUp);
  });
}
