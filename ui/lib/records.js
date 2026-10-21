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
