// Minimal YAML-frontmatter reader for markdown records — the OKF subset the library
// emits (see plugin/library/README.md): flat `key: value` scalars plus inline `[a, b]`
// arrays. Nested YAML is out of scope on purpose; records that need structure put it in
// the body. Shared by the live inventory (project-state.js) and the library gate
// (gen-library-index.js) so both read the exact same fields.

/** @typedef {Record<string, string | string[]>} FrontmatterData */

/** Strip one layer of matching quotes off a YAML scalar. @param {string} s */
function unquote(s) {
  const t = s.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t.endsWith(t[0])) return t.slice(1, -1);
  return t;
}

/**
 * Split a `---`-fenced frontmatter block off a markdown document. Returns
 * `data: null` (and the untouched text as `body`) when there is no block.
 * @param {string} text
 * @returns {{ data: FrontmatterData | null, body: string }}
 */
export function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return { data: null, body: text };
  const close = text.indexOf("\n---", 4);
  if (close === -1) return { data: null, body: text };
  /** @type {FrontmatterData} */
  const data = {};
  for (const line of text.slice(4, close).split("\n")) {
    const m = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    const key = m?.[1];
    if (!key) continue;
    const value = (m?.[2] ?? "").trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((v) => unquote(v))
        .filter(Boolean);
    } else {
      data[key] = unquote(value);
    }
  }
  // close + 4 sits on the char right after the closing `---`; skip its newline if present.
  const after = text.slice(close + 4);
  return { data, body: after.startsWith("\n") ? after.slice(1) : after };
}

/** Render one value in the same subset the parser reads. @param {string | string[]} v */
export function formatValue(v) {
  return Array.isArray(v) ? `[${v.join(", ")}]` : v;
}

/**
 * Set (or add) frontmatter keys in place, keeping every other line and the body untouched.
 * A document with no frontmatter gets a new block. The write side of the subset above.
 * @param {string} text
 * @param {Record<string, string | string[]>} patch
 * @returns {string}
 */
export function setFrontmatterFields(text, patch) {
  const close = text.startsWith("---\n") ? text.indexOf("\n---", 4) : -1;
  const lines = close === -1 ? [] : text.slice(4, close).split("\n");
  const rest = close === -1 ? `\n${text}` : text.slice(close);
  for (const [key, value] of Object.entries(patch)) {
    const line = `${key}: ${formatValue(value)}`;
    const at = lines.findIndex((l) => l.startsWith(`${key}:`));
    if (at === -1) lines.push(line);
    else lines[at] = line;
  }
  return close === -1 ? `---\n${lines.join("\n")}\n---${rest}` : `---\n${lines.join("\n")}${rest}`;
}
