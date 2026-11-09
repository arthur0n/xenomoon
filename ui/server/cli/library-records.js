// Records CLI — the mechanical half of the library-record-* skills (#25–#27, #73). The agent
// writes the words; this writes the frontmatter, the kind log and the kind index so they stay exact.
//   node ui/server/cli/library-records.js new <kind> <slug> --description "<verdict>"
//        [--title "<title>"] [--tags a,b] [--status draft|stable|deprecated] [--by <who>]
//   node ui/server/cli/library-records.js search [--tag t] [--status s] [--kind k] [--text word]
//   node ui/server/cli/library-records.js amend <kind/slug> --note "<change>" [--via <kind/slug>]
//        (--rejected "<text>" | --consequences "<text>" | --keep-sections)
//   node ui/server/cli/library-records.js supersede <kind/old> <kind/new> [--note "<change>"]
//        (--rejected "<text>" | --consequences "<text>" | --keep-sections)
//   node ui/server/cli/library-records.js check
//   node ui/server/cli/library-records.js migrate [root...]   (legacy records → the #73 standard)
// Every command takes --root (default plugin/library; a project passes <project>/.claude/library).
// amend/supersede log the note to <root>/<kind>/log.md (never the body) and refuse any record that
// would fail the strict field + body check, so a legacy record must be migrated first.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { formatValue, parseFrontmatter, setFrontmatterFields } from "../../lib/frontmatter.js";
import { RECORD_STATUSES, RESERVED, bodyProblems, fieldProblems } from "../../lib/records.js";
import {
  REPO,
  readLibrary,
  syncIndex,
  checkRoots,
  defaultRoots,
} from "../features/library/library-io.js";
import { migrateRecord } from "../features/library/library-migrate.js";
import {
  prospectiveLinkProblems,
  roundTripProblems,
} from "../features/library/library-write-check.js";

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
    via: { type: "string" },
    rejected: { type: "string" },
    consequences: { type: "string" },
    "keep-sections": { type: "boolean" },
  },
});
const root = path.resolve(opt.root ?? path.join(REPO, "plugin", "library"));
/** Repo-relative when inside the framework, absolute otherwise. @param {string} f */
const shown = (f) => (f.startsWith(REPO) ? path.relative(REPO, f) : f);
const today = () => new Date().toISOString().slice(0, 10);
/** A kind or slug: kebab-case, so a reference never leaves its root. */
const KEBAB = /^[a-z0-9][a-z0-9-]*$/;
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

/**
 * Regenerate the index of one kind (creating it when missing).
 * @param {string} kind @param {string} [base]  the library root (default --root)
 */
function reindex(kind, base = root) {
  const kd = readLibrary(base).find((k) => k.kind === kind);
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

/** `generated.by`: --by, else `human:<git user.name>`, else `human:unknown`. */
function author() {
  if (opt.by) return opt.by;
  try {
    const name = execFileSync("git", ["config", "user.name"], { encoding: "utf8", stdio: "pipe" });
    if (name.trim()) return `human:${name.trim()}`;
  } catch {
    // no git, or no user.name configured
  }
  return "human:unknown";
}

/**
 * The strict field + body problems of one record's complete text, each prefixed with its name.
 * @param {string} label @param {string} text @param {string} [folder]  its kind folder, when known
 */
function strictProblems(label, text, folder) {
  const { data, body } = parseFrontmatter(text);
  const problems = data
    ? [...fieldProblems(data, { strict: true, folder }), ...bodyProblems(body)]
    : ["no frontmatter"];
  return problems.map((p) => `${label}: ${p}`);
}

/** Refuse (exit 1, nothing written) when any problem is listed. @param {string} what @param {string[]} problems */
function refuseOn(what, problems) {
  if (problems.length)
    fail(`${what} — nothing written; fix these first:\n  ${problems.join("\n  ")}`);
}

/** `new <kind> <slug>` — write one record skeleton in the OKF v0.2 shape. */
function cmdNew() {
  const [kind, slug] = positionals.slice(1);
  if (!kind || !slug || !opt.description) fail("usage: new <kind> <slug> --description <verdict>");
  if (!KEBAB.test(slug)) fail(`slug \`${slug}\` must be kebab-case`);
  if (!KEBAB.test(kind)) fail(`kind \`${kind}\` must be kebab-case`);
  const status = opt.status ?? "draft";
  if (!RECORD_STATUSES.includes(/** @type {any} */ (status)))
    fail(`unknown status \`${status}\` (allowed: ${RECORD_STATUSES.join("|")})`);
  const dir = path.join(root, kind);
  const file = path.join(dir, `${slug}.md`);
  if (existsSync(file)) fail(`${shown(file)} exists — amend or supersede it instead`);
  /** @type {[string, import("../../lib/frontmatter.js").FrontmatterValue][]} */
  const fields = [
    ["type", kind],
    ["title", opt.title ?? slug],
    ["description", opt.description],
    ["status", status],
    ["tags", csv(opt.tags)],
    ["generated", { by: author(), at: new Date().toISOString() }],
  ];
  const fm = fields.map(([k, v]) => `${k}: ${formatValue(v)}`).join("\n");
  const text = `---\n${fm}\n---\n\n${opt.description}\n\n## Why\n\n## Rejected\n\n## Consequences\n\n`;
  refuseOn(`new ${kind}/${slug}`, [
    ...roundTripProblems(text, Object.fromEntries(fields), { exact: true }),
    ...strictProblems(`${kind}/${slug}`, text),
  ]);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, text);
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
      // r.status is the normalised OKF word (draft|stable|deprecated).
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
  const parts = (ref ?? "").replace(/\.md$/, "").split("/");
  const [kind, slug] = parts;
  if (parts.length !== 2 || !kind || !slug || !KEBAB.test(kind) || !KEBAB.test(slug))
    fail(`\`${ref ?? ""}\` must be kind/slug in kebab-case`);
  const file = path.join(root, kind, `${slug}.md`);
  if (!existsSync(file)) fail(`${shown(file)} does not exist`);
  const text = readFileSync(file, "utf8");
  const data = parseFrontmatter(text).data ?? {};
  /** @param {string} key */
  const listOf = (key) => {
    const v = data[key];
    return Array.isArray(v) ? v : typeof v === "string" && v ? [v] : [];
  };
  return { kind, slug, file, text, listOf };
}

/** The challenge: a change must say what it rejected and what follows, or confirm neither moved. */
function challenge() {
  if (opt.rejected === undefined && opt.consequences === undefined && !opt["keep-sections"])
    fail(
      "a change must say what was rejected and what follows: pass --rejected <text>, " +
        "--consequences <text>, or --keep-sections to confirm those sections stay as they are",
    );
}

/**
 * Append `line` as the last line of `heading` in a body. A missing `## Rejected` is created
 * before `## Consequences` (or at the end); a missing `## Consequences` at the end.
 * @param {string} body @param {string} heading @param {string} line
 */
function appendToSection(body, heading, line) {
  const lines = body.split("\n");
  const at = lines.indexOf(heading);
  if (at === -1) {
    const before = heading === "## Rejected" ? lines.indexOf("## Consequences") : -1;
    if (before !== -1) {
      lines.splice(before, 0, heading, "", line, "");
      return lines.join("\n");
    }
    return `${body.trimEnd()}\n\n${heading}\n\n${line}\n`;
  }
  let end = lines.findIndex((l, i) => i > at && l.startsWith("## "));
  if (end === -1) end = lines.length;
  let last = end - 1;
  while (last > at && !lines[last]?.trim()) last -= 1;
  if (last === at) lines.splice(at + 1, 0, "", line);
  else lines.splice(last + 1, 0, line);
  return lines.join("\n");
}

/** Apply --rejected / --consequences to one record's full text. @param {string} text */
function withSections(text) {
  const { body } = parseFrontmatter(text);
  let next = body;
  if (opt.rejected !== undefined) next = appendToSection(next, "## Rejected", `- ${opt.rejected}`);
  if (opt.consequences !== undefined)
    next = appendToSection(next, "## Consequences", `- ${opt.consequences}`);
  return text.slice(0, text.length - body.length) + next;
}

/**
 * The kind's log.md with one `- **Update** <slug> — <note>` line under today's `## YYYY-MM-DD`
 * (sections newest first; today's created right after the H1 when absent).
 * @param {string} kind @param {string} slug @param {string} note
 * @returns {{ file: string, text: string }}
 */
function logged(kind, slug, note) {
  const file = path.join(root, kind, "log.md");
  const entry = `- **Update** ${slug} — ${note}`;
  const day = `## ${today()}`;
  if (!existsSync(file)) return { file, text: `# ${kind} — log\n\n${day}\n\n${entry}\n` };
  const lines = readFileSync(file, "utf8").split("\n");
  const at = lines.indexOf(day);
  if (at === -1) {
    const h1 = lines.findIndex((l) => l.startsWith("# "));
    lines.splice(h1 + 1, 0, "", day, "", entry);
    return { file, text: lines.join("\n") };
  }
  let end = lines.findIndex((l, i) => i > at && l.startsWith("## "));
  if (end === -1) end = lines.length;
  let last = end - 1;
  while (last > at && !lines[last]?.trim()) last -= 1;
  lines.splice(last + 1, 0, entry);
  return { file, text: lines.join("\n") };
}

/**
 * `supersede <old> <new>` — old → deprecated, new.supersedes += old, the challenge applied to
 * the NEW record, the note logged in the old record's kind.
 */
function cmdSupersede() {
  challenge();
  const old = load(positionals[1]);
  const next = load(positionals[2]);
  const ref = old.kind === next.kind ? old.slug : `${old.kind}/${old.slug}`;
  const list = next.listOf("supersedes");
  const oldPatch = { status: "deprecated" };
  const oldText = setFrontmatterFields(old.text, oldPatch);
  const nextPatch = { supersedes: list.includes(ref) ? list : [...list, ref] };
  // An already-present link leaves the text as is (a wrapped list is never half-rewritten).
  const nextText = withSections(
    list.includes(ref) ? next.text : setFrontmatterFields(next.text, nextPatch),
  );
  const writes = [
    { file: old.file, text: oldText },
    { file: next.file, text: nextText },
  ];
  refuseOn(`supersede ${old.kind}/${old.slug}`, [
    ...roundTripProblems(oldText, oldPatch),
    ...roundTripProblems(nextText, nextPatch),
    ...strictProblems(`${old.kind}/${old.slug}`, oldText),
    ...strictProblems(`${next.kind}/${next.slug}`, nextText),
    ...prospectiveLinkProblems(root, writes),
  ]);
  const log = logged(old.kind, old.slug, opt.note ?? `superseded by ${next.kind}/${next.slug}`);
  writeFileSync(old.file, oldText);
  writeFileSync(next.file, nextText);
  writeFileSync(log.file, log.text);
  reindex(old.kind);
  if (next.kind !== old.kind) reindex(next.kind);
  console.log(
    `${old.kind}/${old.slug} superseded by ${next.kind}/${next.slug} (logged, indexes regenerated)`,
  );
}

/**
 * `amend <target> --note "<what changed>" [--via <kind/slug>]` — ONE record keeps living: its
 * status stays, the note goes to the kind's log.md, --rejected/--consequences extend its body.
 * `--via` names a record that carries the amendment; it gets `amends: [target]`.
 */
function cmdAmend() {
  if (opt.by) fail("amend takes --via <kind/slug> for the carrying record (--by is new's author)");
  const t = load(positionals[1]);
  if (!opt.note) fail("usage: amend <kind/slug> --note <what changed> [--via <kind/slug>]");
  challenge();
  const targetText = withSections(t.text);
  /** @type {{ file: string, text: string }[]} */
  const writes = [{ file: t.file, text: targetText }];
  const problems = strictProblems(`${t.kind}/${t.slug}`, targetText);
  let viaKind = t.kind;
  if (opt.via) {
    const via = load(opt.via);
    viaKind = via.kind;
    const ref = via.kind === t.kind ? t.slug : `${t.kind}/${t.slug}`;
    const list = via.listOf("amends");
    const patch = { amends: list.includes(ref) ? list : [...list, ref] };
    const viaText = list.includes(ref) ? via.text : setFrontmatterFields(via.text, patch);
    problems.push(...roundTripProblems(viaText, patch));
    problems.push(...strictProblems(`${via.kind}/${via.slug}`, viaText));
    writes.push({ file: via.file, text: viaText });
    problems.push(...prospectiveLinkProblems(root, writes));
  }
  refuseOn(`amend ${t.kind}/${t.slug}`, problems);
  writes.push(logged(t.kind, t.slug, opt.note));
  for (const w of writes) writeFileSync(w.file, w.text);
  if (viaKind !== t.kind) reindex(viaKind);
  reindex(t.kind);
  console.log(`${t.kind}/${t.slug} amended (logged, index regenerated)`);
}

/** `check` — the library gate for --root (field shapes, index drift). */
function cmdCheck() {
  const { errors, indexes, records } = checkRoots([root], false);
  for (const e of errors) console.error(`✗ ${e}`);
  if (errors.length) process.exit(1);
  console.log(`ok  ${records} records, ${indexes} kind indexes in sync`);
}

/**
 * `migrate [root...]` — every record under each root (positionals, else --root, else the default
 * roots) to the #73 standard; writes changed files, reindexes every folder holding a record, then
 * runs the strict field + body check on every record and exits 1 when any problem remains.
 */
function cmdMigrate() {
  const roots =
    positionals.length > 1
      ? positionals.slice(1).map((r) => path.resolve(r))
      : opt.root
        ? [root]
        : defaultRoots();
  /** @type {string[]} */
  const problems = [];
  let changed = 0;
  let total = 0;
  let folders = 0;
  for (const base of roots) {
    if (!existsSync(base)) continue;
    for (const e of readdirSync(base, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const dir = path.join(base, e.name);
      const files = readdirSync(dir)
        .filter((f) => f.endsWith(".md") && !RESERVED.has(f))
        .sort();
      for (const f of files) {
        const file = path.join(dir, f);
        const text = readFileSync(file, "utf8");
        const out = migrateRecord({
          text,
          folder: e.name,
          slug: f.slice(0, -3),
          mtime: statSync(file).mtime,
        });
        total += 1;
        // Output that fails strict is never written: the file stays as it was, the run exits 1.
        const bad = strictProblems("", out.text, e.name).map((p) => p.slice(2));
        if (bad.length) problems.push(`${shown(file)}: ${bad.join("; ")}`);
        else if (out.changed) {
          writeFileSync(file, out.text);
          changed += 1;
          console.log(`wrote ${shown(file)}`);
        }
      }
      if (files.length) {
        folders += 1;
        reindex(e.name, base);
      }
    }
  }
  for (const p of problems) console.error(`✗ ${p}`);
  console.log(`migrated ${changed} of ${total} records in ${folders} folders`);
  if (problems.length) process.exit(1);
}

/** @type {Record<string, () => void>} */
const COMMANDS = {
  new: cmdNew,
  search: cmdSearch,
  supersede: cmdSupersede,
  amend: cmdAmend,
  check: cmdCheck,
  migrate: cmdMigrate,
};
const run = COMMANDS[positionals[0] ?? ""];
if (!run) fail(`commands: ${Object.keys(COMMANDS).join(", ")}`);
else run();
