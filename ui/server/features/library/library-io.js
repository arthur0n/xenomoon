// Library file IO shared by the index generator (gen-library-index.js) and the records CLI
// (library-records.js). Pure field logic lives in ui/lib/records.js.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "../../../lib/frontmatter.js";
import {
  RESERVED,
  toRecord,
  fieldProblems,
  buildIndex,
  linkProblems,
} from "../../../lib/records.js";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** The framework's library roots: plugin/library + every domain pack's plugin/library. */
export function defaultRoots() {
  const roots = [path.join(REPO, "plugin", "library")];
  const domains = path.join(REPO, "domains");
  if (existsSync(domains))
    for (const d of readdirSync(domains, { withFileTypes: true })) {
      const lib = path.join(domains, d.name, "plugin", "library");
      if (d.isDirectory() && existsSync(lib)) roots.push(lib);
    }
  return roots;
}

/**
 * @typedef {object} KindDir
 * @property {string} kind
 * @property {string} dir
 * @property {boolean} hasIndex
 * @property {import("../../../lib/records.js").LibRecord[]} records
 * @property {string[]} problems   per-file problems (no frontmatter, bad field shapes)
 */

/**
 * Read every kind folder under one library root.
 * @param {string} root
 * @returns {KindDir[]}
 */
export function readLibrary(root) {
  /** @type {KindDir[]} */
  const out = [];
  if (!existsSync(root)) return out;
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = path.join(root, e.name);
    /** @type {KindDir} */
    const kd = {
      kind: e.name,
      dir,
      hasIndex: existsSync(path.join(dir, "index.md")),
      records: [],
      problems: [],
    };
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith(".md") || RESERVED.has(f)) continue;
      const rel = `${e.name}/${f}`;
      const { data } = parseFrontmatter(readFileSync(path.join(dir, f), "utf8"));
      if (!data) {
        kd.problems.push(`${rel}: no frontmatter`);
        continue;
      }
      for (const p of fieldProblems(data)) kd.problems.push(`${rel}: ${p}`);
      kd.records.push(toRecord(f.slice(0, -3), e.name, data));
    }
    out.push(kd);
  }
  return out;
}

/**
 * Regenerate one kind's index.md (only kinds that already have one). Returns true when the
 * file on disk differs from the generated text; writes it when `write` is set.
 * @param {KindDir} kd @param {boolean} write
 */
export function syncIndex(kd, write) {
  if (!kd.hasIndex) return false;
  const file = path.join(kd.dir, "index.md");
  const current = readFileSync(file, "utf8");
  const next = buildIndex(current, kd.records);
  if (next === current) return false;
  if (write) writeFileSync(file, next);
  return true;
}

/**
 * The library gate for a set of roots: per-file problems, broken supersedes/amends links and
 * status disagreements (#28), index drift (regenerated when `write`). Shared by gen-library-index.js and `library-records.js check`.
 * @param {string[]} roots @param {boolean} write
 */
export function checkRoots(roots, write) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const wrote = [];
  let indexes = 0;
  let records = 0;
  for (const root of roots) {
    const rel = root.startsWith(REPO) ? path.relative(REPO, root) : root;
    /** @type {import("../../../lib/records.js").LibRecord[]} */
    const all = [];
    for (const kd of readLibrary(root)) {
      // Only indexed kinds are records; a folder without index.md (e.g. a source list) is free-form.
      if (!kd.hasIndex) continue;
      indexes += 1;
      records += kd.records.length;
      all.push(...kd.records);
      for (const p of kd.problems) errors.push(`${rel}/${p}`);
      if (syncIndex(kd, write)) {
        if (write) wrote.push(`${rel}/${kd.kind}/index.md`);
        else errors.push(`${rel}/${kd.kind}/index.md is stale — regenerate it (--write)`);
      }
    }
    for (const p of linkProblems(all)) errors.push(`${rel}: ${p}`);
  }
  return { errors, wrote, indexes, records };
}
