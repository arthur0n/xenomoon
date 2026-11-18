// Header text for the project page (#95): the home-relative path, the chip's path text, and the
// browser tab title. Plain functions, so `node --test` covers them without a DOM.

const BRAND = "Xenomoon Forge";
/** Left-to-right mark: keeps the path reading left to right inside the chip's `direction: rtl`
 * box (the rtl box is what makes the ellipsis cut the START of the path, not the folder name). */
const LRM = "\u200E";

/** `/Users/<me>/a/b` → `~/a/b`. @param {string} dir @returns {string} */
export function homePath(dir) {
  return dir.replace(/^\/Users\/[^/]+/, "~");
}

/** The chip's path text: home-relative, fenced by LRMs so the leading `~/` and a trailing
 * punctuation mark stay where they belong in the rtl box. @param {string} dir @returns {string} */
export function chipPath(dir) {
  return `${LRM}${homePath(dir)}${LRM}`;
}

/** `<name> · Xenomoon Forge` for a found project, else the bare brand.
 * @param {{ name: string, found: boolean } | null} s @returns {string} */
export function pageTitle(s) {
  return s?.found && s.name ? `${s.name} · ${BRAND}` : BRAND;
}
