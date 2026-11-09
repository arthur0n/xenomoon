// Minimal YAML-frontmatter reader for markdown records — the OKF subset the library
// emits (see plugin/library/README.md): flat `key: value` scalars, inline `[a, b]`
// arrays (also wrapped over several lines up to the line holding `]`, trailing comma ok), and single-level inline `{k: v}` mappings (OKF v0.2 `generated`). Deeper nesting
// is out of scope on purpose; records that need structure put it in the body. A CRLF
// block reads the same as LF. Shared by the live inventory (project-state.js) and the
// library gate (gen-library-index.js) so both read the exact same fields.

/** @typedef {string | string[] | Record<string, string>} FrontmatterValue */
/** @typedef {Record<string, FrontmatterValue>} FrontmatterData */

/** Strip one layer of matching quotes off a YAML scalar. @param {string} s */
function unquote(s) {
  const t = s.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t.endsWith(t[0])) return t.slice(1, -1);
  return t;
}

/**
 * Parse a single-level inline mapping body (the text between `{` and `}`). Pairs split on
 * `,`, each pair on its FIRST `:` so values like `human:arthur` survive.
 * @param {string} inner
 * @returns {Record<string, string>}
 */
function parseMapping(inner) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const pair of inner.split(",")) {
    const at = pair.indexOf(":");
    if (at === -1) continue;
    const k = unquote(pair.slice(0, at));
    if (k) out[k] = unquote(pair.slice(at + 1));
  }
  return out;
}

/**
 * Index of the first `]` outside a `"…"` or `'…'` quote, or -1 (an unclosed quote hides the rest).
 * @param {string} s
 */
export function listEnd(s) {
  let quote = "";
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quote) quote = c === quote ? "" : quote;
    else if (c === '"' || c === "'") quote = c;
    else if (c === "]") return i;
  }
  return -1;
}

/**
 * Parse one trimmed value: inline list, single-level mapping, else a scalar. A `{` inside
 * the braces is deeper nesting, so the whole value stays a string. A list whose closing `]`
 * (found quote-aware) is not its last character stays a string too.
 * @param {string} value
 * @returns {FrontmatterValue}
 */
function parseValue(value) {
  if (value.startsWith("[") && listEnd(value) === value.length - 1) {
    return value
      .slice(1, -1)
      .split(",")
      .map((v) => unquote(v))
      .filter(Boolean);
  }
  if (value.startsWith("{") && value.endsWith("}") && !value.slice(1, -1).includes("{")) {
    return parseMapping(value.slice(1, -1));
  }
  return unquote(value);
}

/** A `key: value` line (the key at column 0). */
const KEY = /^([A-Za-z][\w-]*):\s*(.*)$/;

/**
 * Parse the lines of a frontmatter block (fences excluded) into data.
 * @param {string} block
 * @returns {FrontmatterData}
 */
function parseBlock(block) {
  /** @type {FrontmatterData} */
  const data = {};
  const lines = block.split("\n").map((l) => l.replace(/\r$/, ""));
  for (let i = 0; i < lines.length; i += 1) {
    const m = (lines[i] ?? "").match(KEY);
    const key = m?.[1];
    if (!key) continue;
    const read = readValue(lines, i, (m?.[2] ?? "").trim());
    i = read.last;
    data[key] = parseValue(read.value);
  }
  return data;
}

/**
 * One key's whole value from line `at` on: a flow list wrapped over several lines (prettier's
 * shape, `key:` then `[` … `]`) is joined up to its quote-aware closing `]`; a column-0 `key:`
 * line always starts a new key.
 * @param {string[]} lines @param {number} at  the key's line @param {string} first  its inline value
 * @returns {{ value: string, last: number }}  last = the last line consumed
 */
function readValue(lines, at, first) {
  let i = at;
  let value = first;
  if (value === "" && lines[i + 1]?.trim().startsWith("[")) value = (lines[++i] ?? "").trim();
  while (value.startsWith("[") && listEnd(value) === -1 && i + 1 < lines.length) {
    if (KEY.test(lines[i + 1] ?? "")) break;
    value = `${value} ${(lines[++i] ?? "").trim()}`;
  }
  return { value, last: i };
}

/**
 * Split a `---`-fenced frontmatter block off a markdown document. Returns
 * `data: null` (and the untouched text as `body`) when there is no block.
 * @param {string} text
 * @returns {{ data: FrontmatterData | null, body: string }}
 */
export function parseFrontmatter(text) {
  const open = text.startsWith("---\n") ? 4 : text.startsWith("---\r\n") ? 5 : 0;
  if (!open) return { data: null, body: text };
  const close = text.indexOf("\n---", open);
  if (close === -1) return { data: null, body: text };
  const data = parseBlock(text.slice(open, close));
  // close + 4 sits on the char right after the closing `---`; skip its newline if present.
  const after = text.slice(close + 4);
  const skip = after.startsWith("\n") ? 1 : after.startsWith("\r\n") ? 2 : 0;
  return { data, body: after.slice(skip) };
}

/** Render one value in the same subset the parser reads. @param {FrontmatterValue} v */
export function formatValue(v) {
  if (Array.isArray(v)) return `[${v.join(", ")}]`;
  if (typeof v === "object") {
    const pairs = Object.entries(v).map(([k, x]) => `${k}: ${x}`);
    return pairs.length ? `{ ${pairs.join(", ")} }` : "{}";
  }
  return v;
}

/**
 * Set (or add) frontmatter keys in place, keeping every other line and the body untouched.
 * A document with no frontmatter gets a new block. The write side of the subset above.
 * @param {string} text
 * @param {FrontmatterData} patch
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
