// Decision-record fields — the BASIC, revisable shape for `library/<kind>/<slug>.md` records
// (issue #23, parent #9). The owner has not fixed the final format: every field name, status value
// and the OKF mapping live in THIS file only, so a change is a one-place edit here plus the doc in
// plugin/skills/library-record-writing/SKILL.md.
//
// Written form, OKF v0.2 (issue #73; flat keys, inline arrays, one-level inline mappings —
// the ui/lib/frontmatter.js subset):
//   type (= folder kind), title, description
//   status: draft|stable|deprecated   (absent = stable)
//   tags: [a, b]   generated: { by: <who>, at: <ISO 8601 with Z or ±hh:mm offset> }
//   extensions: supersedes: [slug, ...]  amends: [slug, ...]  (bare slug = same kind, or `kind/slug`)
//               audience: internal|client   (absent = internal; `client` = a client may read it, #47)
// Legacy form, still read until the records are migrated (#73 row 5): name, kind, date YYYY-MM-DD,
// status proposed|accepted|amended|superseded. toRecord normalises it; fieldProblems flags it
// only when `strict`.

/** Record lifecycle values (OKF v0.2), in order. */
export const RECORD_STATUSES = /** @type {const} */ (["draft", "stable", "deprecated"]);

/** Legacy xenomoon lifecycle values, still accepted on read and mapped through OKF_STATUS. */
export const LEGACY_STATUSES = /** @type {const} */ ([
  "proposed",
  "accepted",
  "amended",
  "superseded",
]);

/** Legacy xenomoon status → OKF v0.2 `status` (draft|stable|deprecated). */
export const OKF_STATUS = {
  proposed: "draft",
  accepted: "stable",
  amended: "stable",
  superseded: "deprecated",
};

/** Who may read a record (#47). Absent = internal: sharing is opt-in, never the default. */
export const AUDIENCES = /** @type {const} */ (["internal", "client"]);

/** Statuses a client-facing publish keeps: current records only (no drafts, nothing replaced). */
export const CLIENT_STATUSES = ["stable"];

/** Files in a kind folder that are never records (OKF reserves index.md and log.md). */
export const RESERVED = new Set(["index.md", "log.md", "README.md"]);

/**
 * @typedef {object} LibRecord
 * @property {string} slug        filename minus `.md`
 * @property {string} kind        OKF `type`, else legacy `kind`, else the folder name
 * @property {string} title       `title`, else legacy `name`, else the slug
 * @property {string} description
 * @property {string} status      OKF word: a legacy word mapped through OKF_STATUS, "stable" when
 *                                absent; an unknown word stays as written (fieldProblems flags it)
 * @property {string[]} supersedes
 * @property {string[]} amends
 * @property {string[]} tags
 * @property {string} date        "" when absent
 * @property {string} audience    as written; "internal" when absent
 * @property {{ by: string, at: string }} generated  both "" when absent or not a mapping
 * @property {boolean} legacy     true when any legacy field (name, kind, date, legacy status) is present
 */

import { formatValue } from "./frontmatter.js";

/** Objects (inline mappings) are neither scalars nor lists. @param {import("./frontmatter.js").FrontmatterValue | undefined} v */
const str = (v) => (Array.isArray(v) ? v.join(", ") : typeof v === "object" ? "" : (v ?? ""));
/** @param {import("./frontmatter.js").FrontmatterValue | undefined} v @returns {string[]} */
const list = (v) =>
  v === undefined || v === "" || (typeof v === "object" && !Array.isArray(v))
    ? []
    : Array.isArray(v)
      ? v
      : [v];

/** A value as written: a scalar as is, a list or mapping in its frontmatter form, absent "". @param {import("./frontmatter.js").FrontmatterValue | undefined} v */
const asWritten = (v) => (v === undefined ? "" : typeof v === "string" ? v : formatValue(v));

/** Keys that must hold one scalar (a list or mapping there is a problem, never read as ""). */
const SCALAR_KEYS = ["type", "title", "description", "status", "audience"];

/** @param {string} s @returns {s is (typeof LEGACY_STATUSES)[number]} */
const isLegacyStatus = (s) => LEGACY_STATUSES.includes(/** @type {any} */ (s));

/** Legacy word → OKF word, absent → stable, OKF or unknown word as written. @param {string} s */
const okfStatus = (s) => (!s ? "stable" : isLegacyStatus(s) ? OKF_STATUS[s] : s);

/** ISO 8601 date-time with an explicit offset (`Z` or `±hh:mm`). */
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** Inline mapping (not a scalar, not a list). @param {import("./frontmatter.js").FrontmatterValue | undefined} v @returns {v is Record<string, string>} */
const isMapping = (v) => typeof v === "object" && !Array.isArray(v);

/** The legacy fields present in one record's frontmatter. @param {import("./frontmatter.js").FrontmatterData} data */
function legacyFields(data) {
  const out = ["name", "kind", "date"].filter((k) => str(data[k]) !== "");
  const status = str(data.status);
  if (isLegacyStatus(status)) out.push(`status \`${status}\``);
  return out;
}

/**
 * Normalize parsed frontmatter into a record.
 * @param {string} slug
 * @param {string} folderKind
 * @param {import("./frontmatter.js").FrontmatterData} data
 * @returns {LibRecord}
 */
export function toRecord(slug, folderKind, data) {
  const gen = data.generated;
  return {
    slug,
    kind: str(data.type) || str(data.kind) || folderKind,
    title: str(data.title) || str(data.name) || slug,
    description: str(data.description),
    // A list or mapping keeps its written form: an unknown word, never "stable" (#73 F6).
    status: okfStatus(asWritten(data.status)),
    supersedes: list(data.supersedes),
    amends: list(data.amends),
    tags: list(data.tags),
    date: str(data.date),
    audience: asWritten(data.audience) || "internal",
    generated: isMapping(gen) ? { by: gen.by ?? "", at: gen.at ?? "" } : { by: "", at: "" },
    legacy: legacyFields(data).length > 0,
  };
}

/**
 * `generated` shape problems: present but not a mapping, or `at` not ISO 8601 with an offset.
 * @param {import("./frontmatter.js").FrontmatterValue | undefined} gen
 * @returns {string[]}
 */
function generatedProblems(gen) {
  if (gen === undefined) return [];
  if (!isMapping(gen))
    return ["`generated` must be an inline mapping: generated: { by: x, at: y }"];
  /** @type {string[]} */
  const out = [];
  for (const k of ["by", "at"])
    if (gen[k] !== undefined && typeof gen[k] !== "string")
      out.push(`\`generated.${k}\` must be a scalar`);
  if (typeof gen.by !== "string" || !gen.by.trim()) out.push("missing `generated.by`");
  const at = typeof gen.at === "string" ? gen.at : "";
  if (!ISO_WITH_OFFSET.test(at))
    out.push(`generated.at \`${at}\` is not ISO 8601 with an offset (e.g. 2026-11-02T10:00:00Z)`);
  return out;
}

/**
 * Strict-only problems: each legacy field present, a missing `type`, `title` or `generated`,
 * a `type` that is not the folder name (when the folder is known), an empty link list.
 * @param {import("./frontmatter.js").FrontmatterData} data
 * @param {string} [folder]
 * @returns {string[]}
 */
function strictProblems(data, folder) {
  const out = legacyFields(data).map(
    (f) => `legacy field ${f.startsWith("status") ? f : `\`${f}\``}`,
  );
  for (const key of ["type", "title"]) if (!str(data[key])) out.push(`missing \`${key}\``);
  const type = str(data.type);
  if (folder && type && type !== folder)
    out.push(`\`type\` \`${type}\` is not the folder name \`${folder}\``);
  for (const key of ["supersedes", "amends"])
    if (key in data && !str(data[key])) out.push(`\`${key}\` is empty: drop the key`);
  if (data.generated === undefined) out.push("missing `generated`");
  return out;
}

/**
 * Field-shape problems in one record's frontmatter (no cross-record checks). Non-strict (the
 * default) accepts the legacy form; `strict` also reports each legacy field and a missing
 * `type`, `title` or `generated`, a `type` other than `folder` (when given), an empty link list.
 * @param {import("./frontmatter.js").FrontmatterData} data
 * @param {{ strict?: boolean, folder?: string }} [opts]
 * @returns {string[]}
 */
export function fieldProblems(data, { strict = false, folder } = {}) {
  /** @type {string[]} */
  const out = SCALAR_KEYS.filter((k) => k in data && typeof data[k] !== "string").map(
    (k) => `\`${k}\` must be a scalar`,
  );
  if (!str(data.description)) out.push("missing `description`");
  const status = str(data.status);
  if (status && !RECORD_STATUSES.includes(/** @type {any} */ (status)) && !isLegacyStatus(status))
    out.push(`status \`${status}\` is not one of ${RECORD_STATUSES.join("|")}`);
  out.push(...generatedProblems(data.generated));
  const date = str(data.date);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) out.push(`date \`${date}\` is not YYYY-MM-DD`);
  const audience = str(data.audience);
  if (audience && !AUDIENCES.includes(/** @type {any} */ (audience)))
    out.push(`audience \`${audience}\` is not one of ${AUDIENCES.join("|")}`);
  for (const key of ["supersedes", "amends", "tags"])
    if (typeof data[key] === "string" && data[key] !== "")
      out.push(`\`${key}\` must be an inline list: ${key}: [a, b]`);
  if (strict) out.push(...strictProblems(data, folder));
  return out;
}

/** Body sections (#73): heading → cap on its non-blank lines (heading excluded). */
const BODY_CAPS = new Map([
  ["## Why", 3],
  ["## Context", Infinity],
  ["## Rejected", 5],
  ["## Consequences", 3],
]);
/** Cap on the non-blank lines of a whole body, headings and code lines included. */
const BODY_TOTAL_CAP = 20;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * The one fence rule (CommonMark): a fence opens on a run of 3+ backticks or tildes; only a run
 * of the SAME character at least as long closes it. Returns a scanner fed every line in order:
 * "open" | "close" | "in" (inside a fence) | "" (outside).
 * @returns {(line: string) => "open" | "close" | "in" | ""}
 */
export function fenceScanner() {
  let open = "";
  return (line) => {
    const run = line.match(FENCE)?.[1] ?? "";
    if (!open) {
      open = run;
      return run ? "open" : "";
    }
    if (run && run[0] === open[0] && run.length >= open.length) {
      open = "";
      return "close";
    }
    return "in";
  };
}

/**
 * The body's non-blank lines, trailing whitespace trimmed; `code` marks lines inside (or opening
 * or closing) a fenced block, which are content and never headings.
 * @param {string} body @returns {{ text: string, code: boolean }[]}
 */
function bodyLines(body) {
  /** @type {{ text: string, code: boolean }[]} */
  const out = [];
  const scan = fenceScanner();
  for (const raw of body.split("\n")) {
    const text = raw.trimEnd();
    const state = scan(text);
    if (text.trim()) out.push({ text, code: state !== "" });
  }
  return out;
}

/**
 * Walk the lines into section counts; report H1s, unknown and duplicate `##` headings.
 * @param {{ text: string, code: boolean }[]} lines
 * @returns {{ counts: Map<string, number>, problems: string[] }}
 */
function bodySections(lines) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  /** @type {string[]} */
  const problems = [];
  /** @type {string | null} */
  let current = null;
  for (const { text, code } of lines) {
    if (!code && text.startsWith("# ")) problems.push(`H1 heading \`${text}\` is not allowed`);
    if (code || !text.startsWith("## ")) {
      if (current) counts.set(current, (counts.get(current) ?? 0) + 1);
      continue;
    }
    current = null;
    if (!BODY_CAPS.has(text))
      problems.push(`unknown heading \`${text}\` (allowed: ${[...BODY_CAPS.keys()].join(", ")})`);
    else if (counts.has(text)) problems.push(`duplicate heading \`${text}\``);
    else {
      current = text;
      counts.set(text, 0);
    }
  }
  return { counts, problems };
}

/**
 * Body-shape problems in one record (the Markdown after the frontmatter, #73): a decision line
 * first, no H1, `## Why` required, only the allowed `##` sections once each, the section caps and
 * the whole-body cap on non-blank lines.
 * @param {string} body
 * @returns {string[]}
 */
export function bodyProblems(body) {
  const lines = bodyLines(body);
  if (!lines.length) return ["missing decision line"];
  /** @type {string[]} */
  const out = [];
  if (lines[0]?.text.startsWith("#"))
    out.push("the first non-blank line must be the decision line, not a heading");
  const { counts, problems } = bodySections(lines);
  out.push(...problems);
  if (!counts.has("## Why")) out.push("missing `## Why`");
  for (const [heading, n] of counts) {
    const cap = BODY_CAPS.get(heading) ?? Infinity;
    if (n > cap) out.push(`\`${heading}\` has ${n} non-blank lines, cap ${cap}`);
  }
  if (lines.length > BODY_TOTAL_CAP)
    out.push(`body has ${lines.length} non-blank lines, cap ${BODY_TOTAL_CAP}`);
  return out;
}

/**
 * A record a client may read: marked `audience: client` AND current (`stable`).
 * @param {LibRecord} r
 */
export function isClientShareable(r) {
  return r.audience === "client" && CLIENT_STATUSES.includes(r.status);
}

/**
 * One index line: `- [title](slug.md) — description`, plus `(status)` when not stable.
 * @param {LibRecord} r
 */
export function indexLine(r) {
  const tail = r.status === "stable" ? "" : ` _(${r.status})_`;
  return `- [${r.title}](${r.slug}.md) — ${r.description}${tail}`;
}

/**
 * Rebuild a kind's index.md: keep the hand-written header (everything above the first entry),
 * replace the entries with one line per record sorted by filename.
 * @param {string} current  the existing index.md text
 * @param {LibRecord[]} records
 */
export function buildIndex(current, records) {
  const lines = current.split("\n");
  const first = lines.findIndex((l) => l.startsWith("- ["));
  const header = (first === -1 ? lines : lines.slice(0, first)).join("\n").trimEnd();
  const entries = [...records].sort((a, b) => a.slug.localeCompare(b.slug)).map(indexLine);
  return entries.length ? `${header}\n\n${entries.join("\n")}\n` : `${header}\n`;
}

/**
 * Resolve a reference (`slug` = same kind, or `kind/slug`) to a `kind/slug` key.
 * @param {string} ref @param {string} fromKind
 */
export function refKey(ref, fromKind) {
  return ref.includes("/") ? ref.replace(/\.md$/, "") : `${fromKind}/${ref.replace(/\.md$/, "")}`;
}

/** @type {["supersedes" | "amends", string[] | null][]} each link field → statuses its target may have (null = any) */
const LINKS = [
  ["supersedes", ["deprecated"]],
  ["amends", null],
];

/**
 * Each `deprecated` record must be the supersedes target of exactly one record.
 * @param {LibRecord[]} records @param {Map<string, number>} supersededBy  target key → count
 * @returns {string[]}
 */
function superseders(records, supersededBy) {
  /** @type {string[]} */
  const out = [];
  for (const r of records) {
    const me = `${r.kind}/${r.slug}`;
    const n = supersededBy.get(me) ?? 0;
    if (r.status !== "deprecated") continue;
    if (n === 0) out.push(`${me}: status is \`deprecated\` but no record supersedes it`);
    else if (n > 1)
      out.push(
        `${me}: status is \`deprecated\` and ${n} records supersede it (expected exactly one)`,
      );
  }
  return out;
}

/**
 * Cross-record problems (#28, #73), on the normalised status: a supersedes/amends target that
 * does not exist, a self link, a supersedes target that is not `deprecated`, and a `deprecated`
 * record that is not the supersedes target of exactly one record. An amends target may have any
 * status.
 * @param {LibRecord[]} records  every record of one library root
 * @returns {string[]}
 */
export function linkProblems(records) {
  /** @type {Map<string, LibRecord>} */
  const byKey = new Map(records.map((r) => [`${r.kind}/${r.slug}`, r]));
  /** @type {Map<string, number>} target key → how many records supersede it */
  const supersededBy = new Map();
  /** @type {string[]} */
  const out = [];
  for (const r of records) {
    const me = `${r.kind}/${r.slug}`;
    for (const [field, want] of LINKS) {
      for (const ref of r[field]) {
        const key = refKey(ref, r.kind);
        const target = byKey.get(key);
        if (key === me) out.push(`${me}: ${field} itself`);
        else if (!target) out.push(`${me}: ${field} \`${ref}\`, which does not exist`);
        else if (want && !want.includes(target.status))
          out.push(
            `${me}: ${field} \`${key}\`, whose status is \`${target.status}\` (expected ${want.join(" or ")})`,
          );
        if (field === "supersedes" && key !== me)
          supersededBy.set(key, (supersededBy.get(key) ?? 0) + 1);
      }
    }
  }
  out.push(...superseders(records, supersededBy));
  return out;
}
