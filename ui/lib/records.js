// Decision-record fields — the BASIC, revisable shape for `library/<kind>/<slug>.md` records
// (issue #23, parent #9). The owner has not fixed the final format: every field name, status value
// and the OKF mapping live in THIS file only, so a change is a one-place edit here plus the doc in
// plugin/skills/library-record-writing/SKILL.md.
//
// Fields (flat keys + inline arrays, the ui/lib/frontmatter.js subset):
//   name, kind, description            — as before (`type` / `title` accepted as OKF aliases)
//   status: proposed|accepted|amended|superseded   (absent = accepted, like OKF absent = stable)
//   supersedes: [slug, ...]  amends: [slug, ...]   (bare slug = same kind, or `kind/slug`)
//   tags: [a, b]   date: YYYY-MM-DD

/** Record lifecycle values, in order. */
export const RECORD_STATUSES = /** @type {const} */ ([
  "proposed",
  "accepted",
  "amended",
  "superseded",
]);

/** xenomoon status → OKF v0.2 `status` (draft|stable|deprecated). */
export const OKF_STATUS = {
  proposed: "draft",
  accepted: "stable",
  amended: "stable",
  superseded: "deprecated",
};

/** Files in a kind folder that are never records (OKF reserves index.md and log.md). */
export const RESERVED = new Set(["index.md", "log.md", "README.md"]);

/**
 * @typedef {object} LibRecord
 * @property {string} slug        filename minus `.md`
 * @property {string} kind        `kind`, else OKF `type`, else the folder name
 * @property {string} title       `title`, else `name`, else the slug
 * @property {string} description
 * @property {string} status      as written; "accepted" when absent
 * @property {string[]} supersedes
 * @property {string[]} amends
 * @property {string[]} tags
 * @property {string} date        "" when absent
 */

/** @param {string | string[] | undefined} v */
const str = (v) => (Array.isArray(v) ? v.join(", ") : (v ?? ""));
/** @param {string | string[] | undefined} v */
const list = (v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]);

/**
 * Normalize parsed frontmatter into a record.
 * @param {string} slug
 * @param {string} folderKind
 * @param {import("./frontmatter.js").FrontmatterData} data
 * @returns {LibRecord}
 */
export function toRecord(slug, folderKind, data) {
  return {
    slug,
    kind: str(data.kind) || str(data.type) || folderKind,
    title: str(data.title) || str(data.name) || slug,
    description: str(data.description),
    status: str(data.status) || "accepted",
    supersedes: list(data.supersedes),
    amends: list(data.amends),
    tags: list(data.tags),
    date: str(data.date),
  };
}

/**
 * Field-shape problems in one record's frontmatter (no cross-record checks).
 * @param {import("./frontmatter.js").FrontmatterData} data
 * @returns {string[]}
 */
export function fieldProblems(data) {
  /** @type {string[]} */
  const out = [];
  if (!str(data.description)) out.push("missing `description`");
  const status = str(data.status);
  if (status && !RECORD_STATUSES.includes(/** @type {any} */ (status)))
    out.push(`status \`${status}\` is not one of ${RECORD_STATUSES.join("|")}`);
  const date = str(data.date);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) out.push(`date \`${date}\` is not YYYY-MM-DD`);
  for (const key of ["supersedes", "amends", "tags"])
    if (typeof data[key] === "string" && data[key] !== "")
      out.push(`\`${key}\` must be an inline list: ${key}: [a, b]`);
  return out;
}

/**
 * One index line: `- [title](slug.md) — description`, plus `(status)` when not accepted.
 * @param {LibRecord} r
 */
export function indexLine(r) {
  const tail = r.status === "accepted" ? "" : ` _(${r.status})_`;
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

/** @type {["supersedes" | "amends", string[]][]} each link field → statuses its target may have */
const LINKS = [
  ["supersedes", ["superseded"]],
  ["amends", ["amended", "superseded"]],
];

/**
 * Cross-record problems (#28): a supersedes/amends target that does not exist, a supersedes
 * target that is not `superseded`, a `superseded` record nothing supersedes, an amends target
 * that is neither `amended` nor `superseded`.
 * @param {LibRecord[]} records  every record of one library root
 * @returns {string[]}
 */
export function linkProblems(records) {
  /** @type {Map<string, LibRecord>} */
  const byKey = new Map(records.map((r) => [`${r.kind}/${r.slug}`, r]));
  /** @type {Set<string>} */
  const supersededBy = new Set();
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
        else if (!want.includes(target.status))
          out.push(
            `${me}: ${field} \`${key}\`, whose status is \`${target.status}\` (expected ${want.join(" or ")})`,
          );
        if (field === "supersedes") supersededBy.add(key);
      }
    }
  }
  for (const r of records) {
    const me = `${r.kind}/${r.slug}`;
    if (r.status === "superseded" && !supersededBy.has(me))
      out.push(`${me}: status is \`superseded\` but no record supersedes it`);
  }
  return out;
}
