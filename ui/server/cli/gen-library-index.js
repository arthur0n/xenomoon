// Library kind-index generator — each `library/<kind>/index.md` is BUILT from the records'
// frontmatter, never hand-edited (#24). Default mode checks: exits 1 when an index drifts from
// its records or a record has no / bad frontmatter. Wired into `npm run validate`.
//   node ui/server/cli/gen-library-index.js [root...]           # --check (default)
//   node ui/server/cli/gen-library-index.js --write [root...]   # regenerate the indexes
// Roots default to plugin/library + domains/*/plugin/library; pass a project's .claude/library to
// check that one instead.
import path from "node:path";
import { defaultRoots, checkRoots } from "../features/library/library-io.js";

const write = process.argv.includes("--write");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const roots = args.length ? args.map((a) => path.resolve(a)) : defaultRoots();
const { errors, wrote, indexes, records } = checkRoots(roots, write);

for (const w of wrote) console.log(`wrote ${w}`);
if (errors.length) {
  console.error(`✗ library: ${errors.length} problem(s):`);
  for (const e of errors) console.error(`    ${e}`);
  process.exit(1);
}
console.log(`ok  library: ${records} records, ${indexes} kind indexes in sync`);
