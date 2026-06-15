// Panel resize — drag the seams; widths persist to localStorage.
import { $ } from "./dom.js";
import { parseJSON } from "../lib/json.js";

const rootStyle = document.documentElement.style;
const LS_KEY = "xenodot-panel-widths";
const SIDEBAR_KEY = "xenodot-sidebar-collapsed";

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

const ACTIVITY_KEY = "xenodot-activity-collapsed";

/** A collapsible side panel driven from a topbar toggle: a persisted body class,
 * a glyph that flips with state, and a viewport-aware default when unset.
 * @typedef {object} PanelToggle
 * @property {string} key       - localStorage key for the persisted choice
 * @property {string} bodyClass - class on <body> that the CSS collapses on
 * @property {string} btnId     - the topbar button's id
 * @property {string} glyphIn   - glyph while collapsed (points back toward the panel)
 * @property {string} glyphOut  - glyph while open (points toward the panel's edge)
 * @property {string} label     - panel name, for the button title/tooltip
 * @property {() => boolean} byDefault - collapsed-or-not when nothing is saved */

/** @param {PanelToggle} p @returns {boolean | null} saved choice, or null if unset */
function readPref(p) {
  try {
    const v = localStorage.getItem(p.key);
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}

/** @param {PanelToggle} p @param {boolean} collapsed @param {boolean} persist */
function setCollapsed(p, collapsed, persist) {
  document.body.classList.toggle(p.bodyClass, collapsed);
  const btn = $(p.btnId);
  if (btn) {
    btn.textContent = collapsed ? p.glyphIn : p.glyphOut;
    btn.title = `${collapsed ? "Show" : "Hide"} ${p.label}`;
    btn.setAttribute("aria-expanded", String(!collapsed));
  }
  if (persist) {
    try {
      localStorage.setItem(p.key, collapsed ? "1" : "0");
    } catch {}
  }
}

/** @param {PanelToggle} p */
function wireToggle(p) {
  setCollapsed(p, readPref(p) ?? p.byDefault(), false);
  $(p.btnId)?.addEventListener("click", () => {
    setCollapsed(p, !document.body.classList.contains(p.bodyClass), true);
  });
}

/** Wire both topbar panel toggles. The left side panel starts collapsed on
 * tall/narrow (portrait) monitors so a vertical screen opens roomy; the activity
 * panel starts open (it holds approvals you may need to answer) but can be hidden
 * for the widest possible chat. Either choice, once made, persists. */
export function initPanelToggles() {
  const portraitOrNarrow = () =>
    window.matchMedia("(orientation: portrait)").matches || window.innerWidth < 1080;
  wireToggle({
    key: SIDEBAR_KEY,
    bodyClass: "sidebar-collapsed",
    btnId: "sidebar-toggle",
    glyphIn: "»",
    glyphOut: "«",
    label: "the side panel",
    byDefault: portraitOrNarrow,
  });
  wireToggle({
    key: ACTIVITY_KEY,
    bodyClass: "hide-activity",
    btnId: "activity-toggle",
    glyphIn: "«",
    glyphOut: "»",
    label: "the activity panel",
    byDefault: () => false,
  });
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
