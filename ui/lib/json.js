// JSON helpers. `JSON.parse` / `Response.json()` return `any`; these funnel
// the result through `unknown` so every call site must cast it explicitly —
// that keeps the no-unsafe-* lint rules satisfied instead of letting `any`
// leak across the codebase. `fetch` and `JSON` are globals in both the browser
// and Node 18+, so this module is environment-agnostic.

/** @param {unknown} s @returns {unknown} */
export const parseJSON = (s) => JSON.parse(/** @type {string} */ (s));

/** @param {string} url @returns {Promise<unknown>} */
export const fetchJSON = async (url) => (await fetch(url)).json();
