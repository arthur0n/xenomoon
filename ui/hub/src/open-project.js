// Opens a running project's page in its own named browser tab, or brings that tab forward when it
// is already open: window.open("", name) returns the tab of that name without reloading it, and a tab
// that shows another origin (the project) throws on reading location.href, so it is left as it is.

/** @typedef {import("./row-ops.js").OpResult} OpResult */
/** The part of a browser tab openProject uses.
 * @typedef {{ location: { readonly href: string, replace: (url: string) => void }, focus: () => void }} ProjectTab */
/** The part of the window openProject uses.
 * @typedef {{ open: (url: string, target: string) => ProjectTab | null }} OpenerWindow */

export const BLOCKED_REASON =
  "The browser blocked the new tab. Allow pop-ups for this page, then press Open again.";

export const FAILED_REASON =
  "The browser could not open or reach the project tab. Press Open again.";

/** True when the tab shows this page's origin (a blank new tab); another origin throws on read.
 * @param {ProjectTab} w */
function sameOrigin(w) {
  try {
    void w.location.href;
    return true;
  } catch {
    return false;
  }
}

/** Opens `address` in the tab named `name`, or focuses that tab when it already shows the project.
 * Never throws: a browser call that throws becomes a refusal with FAILED_REASON.
 * @param {{ name: string, address: string }} target
 * @param {OpenerWindow} [win]
 * @returns {OpResult} */
export function openProject({ name, address }, win = window) {
  try {
    const w = win.open("", name);
    if (w === null) return { ok: false, reason: BLOCKED_REASON };
    if (sameOrigin(w)) w.location.replace(address);
    w.focus();
    return { ok: true };
  } catch {
    return { ok: false, reason: FAILED_REASON };
  }
}
