// Records CLI — the mechanical half of the library-record-* skills (#25–#27). The agent writes
// the words; this writes the frontmatter and regenerates the kind index so both stay exact.
//   node ui/server/cli/library-records.js new <kind> <slug> --description "<verdict>"
//        [--title "<title>"] [--tags a,b] [--status proposed|accepted] [--root <library dir>]
//   node ui/server/cli/library-records.js search [--tag t] [--status s] [--kind k] [--text word]
//   node ui/server/cli/library-records.js supersede <kind/old> <kind/new>
//   node ui/server/cli/library-records.js amend <kind/slug> --note "<change>" [--by <kind/slug>]
//   node ui/server/cli/library-records.js check [--root <library dir>]
// --root defaults to plugin/library; a project passes its own <project>/.claude/library.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { formatValue, parseFrontmatter, setFrontmatterFields } from "../../lib/frontmatter.js";
import { RECORD_STATUSES } from "../../lib/records.js";
import { REPO, readLibrary, syncIndex, checkRoots } from "../features/library/library-io.js";

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    tags: { type: "string" },
    status: { type: "string" },
    tag: { type: "string" },
    kind: { type: "string" },
    text: { type: "string" },
    note: { type: "string" },
    by: { type: "string" },
  },
});
const root = path.resolve(opt.root ?? path.join(REPO, "plugin", "library"));
/** Repo-relative when inside the framework, absolute otherwise. @param {string} f */
const shown = (f) => (f.startsWith(REPO) ? path.relative(REPO, f) : f);
const today = () => new Date().toISOString().slice(0, 10);
/** @param {string | undefined} s */
const csv = (s) =>
  s
    ? s
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

/** @param {string} msg @returns {never} */
function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

/** Regenerate the index of one kind (creating it when missing). @param {string} kind */
function reindex(kind) {
  const kd = readLibrary(root).find((k) => k.kind === kind);
  if (!kd) return;
  for (const p of kd.problems) console.warn(`⚠ ${p}`);
  if (!kd.hasIndex) {
    writeFileSync(
      path.join(kd.dir, "index.md"),
      `# ${kind} — index\n\nOne line per record, sorted by filename: \`- [<title>](<slug>.md) — <description>\`\n`,
    );
    kd.hasIndex = true;
  }
  syncIndex(kd, true);
}

/** `new <kind> <slug>` — write one record skeleton in the current format. */
function cmdNew() {
  const [kind, slug] = positionals.slice(1);
  if (!kind || !slug || !opt.description) fail("usage: new <kind> <slug> --description <verdict>");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) fail(`slug \`${slug}\` must be kebab-case`);
  const status = opt.status ?? "proposed";
  if (!RECORD_STATUSES.includes(/** @type {any} */ (status))) fail(`unknown status \`${status}\``);
  const dir = path.join(root, kind);
  const file = path.join(dir, `${slug}.md`);
  if (existsSync(file)) fail(`${shown(file)} exists — amend or supersede it instead`);
  mkdirSync(dir, { recursive: true });
  const title = opt.title ?? slug;
  /** @type {[string, string | string[]][]} */
  const fields = [
    ["name", slug],
    ["kind", kind],
    ["title", title],
    ["description", opt.description],
    ["status", status],
    ["tags", csv(opt.tags)],
    ["date", today()],
  ];
  const fm = fields.map(([k, v]) => `${k}: ${formatValue(v)}`).join("\n");
  writeFileSync(file, `---\n${fm}\n---\n\n# ${title}\n\n## Decision\n\n## Why\n`);
  reindex(kind);
  console.log(`wrote ${shown(file)} (index regenerated)`);
}

/** `search` — filter records by tag / status / kind / text; meaning is the agent reading the lines. */
function cmdSearch() {
  const text = opt.text?.toLowerCase();
  let hits = 0;
  for (const kd of readLibrary(root)) {
    if (opt.kind && kd.kind !== opt.kind) continue;
    for (const r of kd.records) {
      if (opt.tag && !r.tags.includes(opt.tag)) continue;
      if (opt.status && r.status !== opt.status) continue;
      const hay = [r.slug, r.title, r.description, ...r.tags, ...r.supersedes, ...r.amends]
        .join(" ")
        .toLowerCase();
      if (text && !hay.includes(text)) continue;
      hits += 1;
      const tags = r.tags.length ? ` [${r.tags.join(", ")}]` : "";
      console.log(`${kd.kind}/${r.slug} (${r.status})${tags} — ${r.description}`);
    }
  }
  if (!hits) console.log("no records match");
}

/**
 * Resolve a `kind/slug` argument to its file, frontmatter and kind.
 * @param {string | undefined} ref
 */
function load(ref) {
  const [kind, slug] = (ref ?? "").replace(/\.md$/, "").split("/");
  if (!kind || !slug) fail(`\`${ref ?? ""}\` must be kind/slug`);
  const file = path.join(root, kind, `${slug}.md`);
  if (!existsSync(file)) fail(`${shown(file)} does not exist`);
  const text = readFileSync(file, "utf8");
  const data = parseFrontmatter(text).data ?? {};
  /** @param {string} key */
  const listOf = (key) => {
    const v = data[key];
    return Array.isArray(v) ? v : v ? [v] : [];
  };
  return { kind, slug, file, text, listOf };
}

/** `supersede <old> <new>` — edits BOTH records: old → superseded, new.supersedes += old. */
function cmdSupersede() {
  const old = load(positionals[1]);
  const next = load(positionals[2]);
  const ref = old.kind === next.kind ? old.slug : `${old.kind}/${old.slug}`;
  const list = next.listOf("supersedes");
  writeFileSync(old.file, setFrontmatterFields(old.text, { status: "superseded" }));
  if (!list.includes(ref))
    writeFileSync(next.file, setFrontmatterFields(next.text, { supersedes: [...list, ref] }));
  reindex(old.kind);
  if (next.kind !== old.kind) reindex(next.kind);
  console.log(
    `${old.kind}/${old.slug} superseded by ${next.kind}/${next.slug} (indexes regenerated)`,
  );
}

/**
 * `amend <target> --note "<what changed>" [--by <kind/slug>]` — ONE record keeps living: status
 * amended, date bumped, the change logged under `## Changes`. `--by` names a record that carries
 * the amendment; it gets `amends: [target]`.
 */
function cmdAmend() {
  const t = load(positionals[1]);
  if (!opt.note) fail("usage: amend <kind/slug> --note <what changed> [--by <kind/slug>]");
  const stamped = setFrontmatterFields(t.text, { status: "amended", date: today() });
  const line = `- ${today()} — ${opt.note}`;
  const logged = /\n## Changes\n/.test(stamped)
    ? stamped.replace(/\n## Changes\n\n?/, (m) => `${m.trimEnd()}\n\n${line}\n`)
    : `${stamped.trimEnd()}\n\n## Changes\n\n${line}\n`;
  writeFileSync(t.file, logged);
  if (opt.by) {
    const by = load(opt.by);
    const ref = by.kind === t.kind ? t.slug : `${t.kind}/${t.slug}`;
    const list = by.listOf("amends");
    if (!list.includes(ref))
      writeFileSync(by.file, setFrontmatterFields(by.text, { amends: [...list, ref] }));
    if (by.kind !== t.kind) reindex(by.kind);
  }
  reindex(t.kind);
  console.log(`${t.kind}/${t.slug} amended (change logged, index regenerated)`);
}

/** `check` — the library gate for --root (field shapes, index drift). */
function cmdCheck() {
  const { errors, indexes, records } = checkRoots([root], false);
  for (const e of errors) console.error(`✗ ${e}`);
  if (errors.length) process.exit(1);
  console.log(`ok  ${records} records, ${indexes} kind indexes in sync`);
}

/** @type {Record<string, () => void>} */
const COMMANDS = {
  new: cmdNew,
  search: cmdSearch,
  supersede: cmdSupersede,
  amend: cmdAmend,
  check: cmdCheck,
};
const run = COMMANDS[positionals[0] ?? ""];
if (!run) fail(`commands: ${Object.keys(COMMANDS).join(", ")}`);
else run();
