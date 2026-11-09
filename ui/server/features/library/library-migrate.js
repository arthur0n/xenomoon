// Legacy library record → the #73 standard (OKF v0.2 frontmatter + the short body shape), as a
// pure text transform: no fs. The records CLI (`library-records.js migrate`) reads, calls
// migrateRecord, writes. Idempotent by construction: a record that already passes the strict field
// check and the body check comes back unchanged, and every transformed output passes both.
import { formatValue, parseFrontmatter } from "../../../lib/frontmatter.js";
import { OKF_STATUS, bodyProblems, fenceScanner, fieldProblems } from "../../../lib/records.js";

/** Section caps on non-blank lines; overflow moves to the end of `## Context`. */
const CAPS = { "## Why": 3, "## Rejected": 5, "## Consequences": 3 };
const TOTAL_CAP = 20;
/** Frontmatter keys that lead the output, in order; `generated` goes last. */
const LEAD = ["type", "title", "description", "status"];
const DROPPED = new Set(["name", "kind", "date"]);

/**
 * A unit is what moves between sections as one piece: one plain line, or a whole fenced block.
 * @typedef {{ lines: string[], n: number, gap: boolean, code: boolean }} Unit
 * `n` = its non-blank lines, `gap` = a blank line stood before it.
 */
/** @typedef {{ heading: string, units: Unit[] }} Section */

/**
 * Split body text into units; `##` lines outside fences become section boundaries.
 * @param {string} body
 * @returns {{ preamble: Unit[], sections: Section[] }}
 */
function parseBody(body) {
  /** @type {Unit[]} */
  const preamble = [];
  /** @type {Section[]} */
  const sections = [];
  let units = preamble;
  let gap = false;
  /** @type {Unit | null} */
  let fence = null;
  const scan = fenceScanner();
  for (const raw of body.split("\n")) {
    const text = raw.trimEnd();
    const state = scan(text);
    if (fence) {
      fence.lines.push(text);
      if (text.trim()) fence.n += 1;
      if (state === "close") fence = null;
      continue;
    }
    if (!text.trim()) {
      gap = true;
      continue;
    }
    if (!state && text.startsWith("## ")) {
      units = [];
      sections.push({ heading: text, units });
      gap = false;
      continue;
    }
    const unit = { lines: [text], n: 1, gap, code: state === "open" };
    units.push(unit);
    gap = false;
    if (state === "open") fence = unit;
  }
  return { preamble, sections };
}

/** @param {string} text @param {boolean} [gap] @returns {Unit} */
const line = (text, gap = true) => ({ lines: [text], n: 1, gap, code: false });

/** A unit that can be the decision line: a plain, non-heading line. @param {Unit} u */
const plain = (u) => !u.code && !u.lines[0]?.startsWith("#");

/** A line that opens a new list item. @param {string} s */
const ITEM = /^\s*([-*+]|\d+[.)]|\(\d+\))\s/;

/**
 * Remove and return the first paragraph (bullet marker stripped) joined with single spaces, or "".
 * The paragraph is the first plain unit plus the plain units right after it with no blank line
 * between; a heading, a fence or a new list item ends it.
 * @param {Unit[]} units
 */
function takeDecision(units) {
  const at = units.findIndex(plain);
  if (at === -1) return "";
  let end = at + 1;
  for (let u = units[end]; u && plain(u) && !u.gap && !ITEM.test(u.lines[0] ?? ""); u = units[end])
    end += 1;
  return units
    .splice(at, end - at)
    .map((u) => (u.lines[0] ?? "").trim())
    .join(" ")
    .replace(/^[-*] /, "");
}

/** A line that would be read as structure: heading, list item, fence. */
const STRUCTURE = /^\s*(#|[-*+]\s|\d+[.)]|\(\d+\)|`{3}|~{3})/;

/** A fallback line (frontmatter text written into the body) that would read as structure is bolded. @param {string} s */
const safe = (s) => (STRUCTURE.test(s) ? `**${s}**` : s);

/** Text up to the first `.`, `!` or `?` followed by space or end, else the whole line. @param {string} s */
const firstSentence = (s) => s.match(/^(.*?[.!?])(\s|$)/)?.[1] ?? s;

/** A non-leading `# ` line outside a fence is not allowed in a body: bold it. @param {Unit[]} units */
const boldH1s = (units) =>
  units.map((u) =>
    !u.code && u.lines[0]?.startsWith("# ") ? line(`**${u.lines[0].slice(2)}**`, u.gap) : u,
  );

/**
 * Move units past a non-blank cap into `overflow`; the cut is at a whole unit.
 * @param {Unit[]} units @param {number} cap @param {Unit[]} overflow
 */
function capUnits(units, cap, overflow) {
  let used = 0;
  const at = units.findIndex((u) => (used += u.n) > cap);
  if (at === -1) return units;
  overflow.push(...units.slice(at));
  return units.slice(0, at);
}

/**
 * The parsed body regrouped into the standard sections.
 * @param {{ preamble: Unit[], sections: Section[] }} parsed
 */
function regroup({ preamble, sections }) {
  /** @type {Map<string, Unit[]>} */
  const known = new Map();
  /** @type {Unit[]} */
  const demoted = [];
  for (const s of sections) {
    const units = boldH1s(s.units);
    if (s.heading === "## Changes") continue;
    if (
      ["## Decision", "## Why", "## Context", "## Rejected", "## Consequences"].includes(s.heading)
    )
      known.set(s.heading, [...(known.get(s.heading) ?? []), ...units]);
    else demoted.push(line(`**${s.heading.slice(3).trim()}**`), ...units);
  }
  return { known, demoted, preamble: boldH1s(preamble) };
}

/**
 * Body text in the standard shape (decision line, Why, Context, Rejected, Consequences).
 * @param {{ preamble: Unit[], sections: Section[] }} parsed
 * @param {string} decision   the decision line, already chosen
 * @param {string} description
 */
function buildSections(parsed, decision, description) {
  const { known, demoted, preamble } = regroup(parsed);
  const decisionRest = known.get("## Decision") ?? [];
  /** @type {Unit[]} */
  const overflow = [];
  /** @type {Record<string, Unit[]>} */
  const capped = {};
  for (const [h, cap] of Object.entries(CAPS))
    capped[h] = capUnits(known.get(h) ?? [], cap, overflow);
  if (!capped["## Why"]?.length) capped["## Why"] = [line(safe(description))];
  const context = [
    ...decisionRest,
    ...preamble,
    ...(known.get("## Context") ?? []),
    ...demoted,
    ...overflow,
  ];
  return {
    decision,
    why: capped["## Why"] ?? [],
    context,
    rejected: capped["## Rejected"] ?? [],
    consequences: capped["## Consequences"] ?? [],
  };
}

/** @param {Unit[]} units */
function renderUnits(units) {
  /** @type {string[]} */
  const out = [];
  units.forEach((u, i) => {
    if (i > 0 && u.gap) out.push("");
    out.push(...u.lines);
  });
  return out;
}

/** @param {ReturnType<typeof buildSections>} s @param {boolean} withContext */
function renderBody(s, withContext) {
  /** @type {[string, Unit[]][]} */
  const parts = [
    ["## Why", s.why],
    ["## Context", withContext ? s.context : []],
    ["## Rejected", s.rejected],
    ["## Consequences", s.consequences],
  ];
  const out = [s.decision];
  for (const [h, units] of parts)
    if (units.length || h === "## Why") out.push("", h, "", ...renderUnits(units));
  return `${out.join("\n")}\n`;
}

/** @param {string} text */
const nonBlank = (text) => text.split("\n").filter((l) => l.trim()).length;

/**
 * Render, dropping trailing Context units (then the Context heading) until the total cap fits.
 * Past that the body is left as is for the strict check to report.
 * @param {ReturnType<typeof buildSections>} s
 */
function fitBody(s) {
  const context = [...s.context];
  let body = renderBody({ ...s, context }, true);
  while (nonBlank(body) > TOTAL_CAP && context.length) {
    context.pop();
    body = renderBody({ ...s, context }, true);
  }
  return nonBlank(body) > TOTAL_CAP ? renderBody(s, false) : body;
}

/**
 * Raw `key: value` lines of a frontmatter block (last wins, like parseFrontmatter); a key's
 * continuation lines (a wrapped list) stay with it.
 * @param {string} text
 * @returns {Map<string, string>}
 */
function rawFields(text) {
  /** @type {Map<string, string>} */
  const out = new Map();
  if (!text.startsWith("---\n")) return out;
  const close = text.indexOf("\n---", 4);
  if (close === -1) return out;
  /** @type {string | undefined} */
  let last;
  for (const l of text.slice(4, close).split("\n")) {
    const key = l.match(/^([A-Za-z][\w-]*):/)?.[1];
    if (key) {
      out.delete(key);
      out.set(key, l);
      last = key;
    } else if (last && l.trim()) out.set(last, `${out.get(last)}\n${l}`);
  }
  return out;
}

/** UTC date of a Date as YYYY-MM-DD. @param {Date} d */
const ymd = (d) => d.toISOString().slice(0, 10);

/** A frontmatter value as a scalar string ("" for lists, mappings, absent). @param {unknown} v */
const scalar = (v) => (typeof v === "string" ? v : "");

/** @param {string} k @param {import("../../../lib/frontmatter.js").FrontmatterValue} v */
const set = (k, v) => `${k}: ${formatValue(v)}`;

/** An empty parsed value (`key:` or `[]`): the key is dropped. @param {unknown} v */
const empty = (v) => v === "" || (Array.isArray(v) && !v.length);

/** The status line: a legacy word mapped, anything else kept as written. @param {string} raw @param {string} status */
const statusLine = (raw, status) =>
  status in OKF_STATUS
    ? set("status", OKF_STATUS[/** @type {keyof typeof OKF_STATUS} */ (status)])
    : raw;

/**
 * The migrated frontmatter lines.
 * @param {Map<string, string>} raw  raw lines of the input block
 * @param {import("../../../lib/frontmatter.js").FrontmatterData} data
 * @param {{ folder: string, title: string, description: string, mtime: Date }} o
 */
function buildFields(raw, data, o) {
  const date = scalar(data.date) || ymd(o.mtime);
  const out = [
    set("type", o.folder),
    raw.get("title") ?? set("title", o.title),
    raw.get("description") ?? set("description", o.description),
  ];
  const status = raw.get("status");
  if (status !== undefined) out.push(statusLine(status, scalar(data.status)));
  // A parsed list is written single-line; anything else (a list that failed to parse included)
  // keeps its raw lines, continuation lines too, for the strict check to report. Empty: dropped.
  for (const [k, l] of raw) {
    if (LEAD.includes(k) || DROPPED.has(k) || k === "generated" || empty(data[k])) continue;
    const v = data[k];
    out.push(Array.isArray(v) ? set(k, v) : l);
  }
  out.push(
    raw.get("generated") ?? set("generated", { by: "human:migrate", at: `${date}T00:00:00Z` }),
  );
  return out;
}

/** Remove a leading H1 from the preamble; its text, or "". @param {Unit[]} preamble */
function takeH1(preamble) {
  const first = preamble[0];
  if (!first || first.code || !first.lines[0]?.startsWith("# ")) return "";
  preamble.shift();
  return first.lines[0].slice(2).trim();
}

/**
 * Drop a leading H1 from the preamble; pick the decision line, title and description.
 * @param {{ preamble: Unit[], sections: Section[] }} parsed  mutated: H1 and decision removed
 * @param {import("../../../lib/frontmatter.js").FrontmatterData} fm @param {string} slug
 */
function head(parsed, fm, slug) {
  const h1Text = takeH1(parsed.preamble);
  const title = scalar(fm.title) || h1Text || slug;
  // With a description it IS the decision line (as `new` writes it); the whole old
  // `## Decision` section then opens Context (buildSections). Without one: the first paragraph.
  if (scalar(fm.description))
    return { decision: safe(scalar(fm.description)), title, description: scalar(fm.description) };
  const decisionSection = parsed.sections.find((s) => s.heading === "## Decision");
  const decision = takeDecision(decisionSection?.units ?? []) || takeDecision(parsed.preamble);
  const description = firstSentence(decision) || title;
  return { decision: decision || safe(description), title, description };
}

/**
 * Migrate one record's text to the #73 standard.
 * @param {{ text: string, folder: string, slug: string, mtime: Date }} input
 *   folder = the kind folder name (always the output `type`), mtime = the file's mtime (default `generated.at`)
 * @returns {{ text: string, changed: boolean }}
 */
export function migrateRecord({ text: input, folder, slug, mtime }) {
  const text = input.replace(/\r\n/g, "\n");
  const { data, body } = parseFrontmatter(text);
  if (data && !fieldProblems(data, { strict: true, folder }).length && !bodyProblems(body).length)
    return { text, changed: text !== input };
  const fm = data ?? {};
  const parsed = parseBody(body);
  const { decision, title, description } = head(parsed, fm, slug);
  const sections = buildSections(parsed, decision, description);
  const fields = buildFields(rawFields(text), fm, { folder, title, description, mtime });
  return { text: `---\n${fields.join("\n")}\n---\n\n${fitBody(sections)}`, changed: true };
}
