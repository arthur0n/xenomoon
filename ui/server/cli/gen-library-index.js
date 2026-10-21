// Library kind-index generator — each `library/<kind>/index.md` is BUILT from the records'
// frontmatter, never hand-edited (#24). Default mode checks: exits 1 when an index drifts from
// its records or a record has no / bad frontmatter. Wired into `npm run validate`.
//   node ui/server/cli/gen-library-index.js [root...]           # --check (default)
//   node ui/server/cli/gen-library-index.js --write [root...]   # regenerate the indexes
// Roots default to plugin/library + domains/*/plugin/library; pass a project's .claude/library to
// check that one instead.
import path from "node:path";
import { defaultRoots, readLibrary, syncIndex, REPO } from "../features/library/library-io.js";

const write = process.argv.includes("--write");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const roots = args.length ? args.map((a) => path.resolve(a)) : defaultRoots();

/** @type {string[]} */
const errors = [];
let indexes = 0;
let records = 0;
for (const root of roots) {
  const rel = path.relative(REPO, root) || root;
  for (const kd of readLibrary(root)) {
    // Only indexed kinds are records; a folder without index.md (e.g. a source list) is free-form.
    if (!kd.hasIndex) continue;
    records += kd.records.length;
    for (const p of kd.problems) errors.push(`${rel}/${p}`);
    indexes += 1;
    if (syncIndex(kd, write)) {
      if (write) console.log(`wrote ${rel}/${kd.kind}/index.md`);
      else errors.push(`${rel}/${kd.kind}/index.md is stale — run: npm run library:index`);
    }
  }
}

if (errors.length) {
  console.error(`✗ library: ${errors.length} problem(s):`);
  for (const e of errors) console.error(`    ${e}`);
  process.exit(1);
}
console.log(`ok  library: ${records} records, ${indexes} kind indexes in sync`);
