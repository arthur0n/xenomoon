#!/usr/bin/env node
// Client docs (#48, parent #13) — the BASIC generator. One source (the library records), a
// generated output, no second copy: the records marked `audience: client` whose status is
// accepted or amended (ui/lib/records.js isClientShareable) are written to a static folder as
// one markdown per record plus an index.md. No hosting, no external service — how client docs
// are finally published is not decided yet.
//   node ui/server/cli/client-docs.js --out <dir> [--root <library dir>]
// --out is required and must sit OUTSIDE the framework repo; an existing non-empty folder is
// refused (nothing is ever overwritten). --root defaults to plugin/library.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseFrontmatter } from "../../lib/frontmatter.js";
import { isClientShareable } from "../../lib/records.js";
import { REPO, readLibrary } from "../features/library/library-io.js";

/**
 * @typedef {object} ClientDoc
 * @property {string} file   output path relative to the output folder (`<kind>/<slug>.md`)
 * @property {import("../../lib/records.js").LibRecord} record
 * @property {string} body   the record body, frontmatter stripped (internal links stay out)
 */

/**
 * The client-shareable records of one library root, sorted by kind then slug.
 * @param {string} root
 * @returns {ClientDoc[]}
 */
export function selectClientDocs(root) {
  /** @type {ClientDoc[]} */
  const out = [];
  for (const kd of readLibrary(root))
    for (const record of kd.records) {
      if (!isClientShareable(record)) continue;
      const text = readFileSync(path.join(kd.dir, `${record.slug}.md`), "utf8");
      out.push({ file: `${kd.kind}/${record.slug}.md`, record, body: parseFrontmatter(text).body });
    }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/** The index page: one line per doc. @param {ClientDoc[]} docs */
export function indexPage(docs) {
  const lines = docs.map((d) => `- [${d.record.title}](${d.file}) — ${d.record.description}`);
  return `# Client documents\n\n${lines.length ? lines.join("\n") : "_No client documents._"}\n`;
}

/**
 * Why `out` is not a safe output folder, or "" when it is.
 * @param {string} out absolute @param {string} [repo]
 */
export function outProblem(out, repo = REPO) {
  const rel = path.relative(repo, out);
  if (!rel || (!rel.startsWith("..") && !path.isAbsolute(rel)))
    return `--out ${out} is inside the framework repo — write client docs elsewhere`;
  if (existsSync(out) && readdirSync(out).length > 0)
    return `--out ${out} exists and is not empty — pick an empty or new folder`;
  return "";
}

/**
 * Write the client docs of `root` into `out` (which must already pass outProblem).
 * @param {string} root @param {string} out
 * @returns {ClientDoc[]} what was written
 */
export function writeClientDocs(root, out) {
  const docs = selectClientDocs(root);
  mkdirSync(out, { recursive: true });
  for (const d of docs) {
    const target = path.join(out, d.file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, d.body);
  }
  writeFileSync(path.join(out, "index.md"), indexPage(docs));
  return docs;
}

function main() {
  const { values: opt } = parseArgs({
    options: { out: { type: "string" }, root: { type: "string" } },
  });
  if (!opt.out) {
    console.error("✗ usage: client-docs.js --out <dir outside the repo> [--root <library dir>]");
    process.exit(1);
  }
  const out = path.resolve(opt.out);
  const root = path.resolve(opt.root ?? path.join(REPO, "plugin", "library"));
  const problem = outProblem(out);
  if (problem) {
    console.error(`✗ ${problem}`);
    process.exit(1);
  }
  const docs = writeClientDocs(root, out);
  console.log(`ok  client-docs: ${docs.length} record(s) → ${out}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
