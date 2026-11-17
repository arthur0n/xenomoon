// The XenomoonForge tokens for the hub page, taken at build time (ui/hub/vite.config.js): the first
// real `:root { ... }` block of ui/agent-ui.css, comments removed first so a commented example is
// never taken, and checked to declare every custom property ui/hub/src/hub.css reads. Pure strings;
// no Vite, no file reads, so node --test runs it alone.

/** The CSS with every comment removed; text inside quotes is kept as written.
 * @param {string} css @returns {string} */
export function stripComments(css) {
  let out = "";
  /** @type {string | null} */
  let quote = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      out += c;
      if (c === "\\") out += css[++i] ?? "";
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      out += c;
    } else if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end === -1) throw new Error("hub build: a comment in ui/agent-ui.css is not closed");
      i = end + 1;
    } else out += c;
  }
  return out;
}

/** The first `:root { ... }` block outside comments, braces matched; throws when there is none.
 * @param {string} css @returns {string} */
export function rootBlock(css) {
  const clean = stripComments(css);
  const m = /:root\s*\{/.exec(clean);
  if (!m) throw new Error("hub build: no :root block in ui/agent-ui.css");
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < clean.length; i++) {
    if (clean[i] === "{") depth++;
    else if (clean[i] === "}" && --depth === 0) return clean.slice(m.index, i + 1);
  }
  throw new Error("hub build: the :root block of ui/agent-ui.css is not closed");
}

/** The custom properties a stylesheet reads with var(--x) and does not declare itself, sorted.
 * @param {string} css @returns {string[]} */
export function readTokens(css) {
  const clean = stripComments(css);
  const declared = new Set([...clean.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const read = [...clean.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => String(m[1]));
  return [...new Set(read)].filter((t) => !declared.has(t)).sort();
}

/** The :root block of `uiCss`; throws, naming them, when it lacks a token `pageCss` reads.
 * @param {string} uiCss ui/agent-ui.css @param {string} pageCss ui/hub/src/hub.css
 * @returns {string} */
export function tokenBlock(uiCss, pageCss) {
  const block = rootBlock(uiCss);
  const has = new Set([...block.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const missing = readTokens(pageCss).filter((t) => !has.has(t));
  if (missing.length)
    throw new Error(
      `hub build: the :root block of ui/agent-ui.css does not declare ${missing.join(", ")}, which ui/hub/src/hub.css reads`,
    );
  return block;
}
