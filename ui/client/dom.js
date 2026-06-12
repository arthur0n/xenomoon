// Typed DOM lookups. `$` is an HTMLElement; `$input` casts to HTMLInputElement
// for the few fields we read `.value`/`.checked` off; `$$` returns an array of
// HTMLElements (so `.dataset` etc. are available, unlike a raw NodeList<Element>).

/** @param {string} id @returns {HTMLElement} */
export const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {string} id @returns {HTMLInputElement} */
export const $input = (id) => /** @type {HTMLInputElement} */ ($(id));

/** @param {string} sel @returns {HTMLElement[]} */
export const $$ = (sel) =>
  /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll(sel)));

/**
 * @param {string} tag
 * @param {string} [cls]
 * @param {string | null} [text]
 * @returns {HTMLElement}
 */
export const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
