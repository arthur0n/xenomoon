// Structure guard — the domain-folder convention is ENFORCED here, not just documented in
// .claude/CLAUDE.md. `ui/server/` and `ui/client/` must contain only domain subfolders; a new
// module belongs IN a domain (server: core/ (+core/http/), integrations/<name>/,
// features/<domain>/, mcp-tools/, cli/ — client: core/ or features/<domain>/), never loose at
// the top level. Catches the failure mode the reorg can silently regress: a flat file dropped
// back into ui/server/ or ui/client/. `ui/hub/` (the React + Vite hub page) holds only HUB_TOP;
// its code lives in ui/hub/src/ as .jsx/.js. Bare-node, no test runner (same style as
// ui/reducer.check.js); wired into `npm run validate`, the pre-commit hook, and CI.
//   node ui/structure.check.js        # exits 1 (and lists offenders) on any violation
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UI = path.dirname(fileURLToPath(import.meta.url)); // ui/
// Trees that must stay free of loose top-level code files.
const GUARDED = ["server", "client"];
// Code files only — a top-level README.md or similar doc is fine; a stray module is not.
const CODE = /\.(js|mjs|cjs|jsx|ts|tsx)$/;
// ui/hub/ top level: the Vite entry page + config, the source folder, the git-ignored build.
const HUB_TOP = ["index.html", "vite.config.js", "src", "dist"];
// ui/hub/src/ (any depth): JSX/JS with JSDoc types only — no .ts/.tsx.
const HUB_SRC = /\.(js|jsx)$/;

const violations = [];
for (const tree of GUARDED) {
  for (const e of readdirSync(path.join(UI, tree), { withFileTypes: true })) {
    if (e.isFile() && CODE.test(e.name)) violations.push(`ui/${tree}/${e.name}`);
  }
}

const hubViolations = [];
for (const e of readdirSync(path.join(UI, "hub"), { withFileTypes: true })) {
  if (!HUB_TOP.includes(e.name)) hubViolations.push(`ui/hub/${e.name}`);
}
for (const rel of readdirSync(path.join(UI, "hub", "src"), { recursive: true, encoding: "utf8" })) {
  if (CODE.test(rel) && !HUB_SRC.test(rel)) hubViolations.push(`ui/hub/src/${rel}`);
}

if (hubViolations.length) {
  console.error("✗ structure: unexpected entry(ies) in the hub page folder:");
  for (const v of hubViolations) console.error(`    ${v}`);
  console.error(
    `  ui/hub/ holds only ${HUB_TOP.join(", ")}. Put page code in ui/hub/src/ as .jsx (or .js)`,
  );
  console.error("  with JSDoc types, no .ts/.tsx; anything else belongs outside ui/hub/.");
}
if (violations.length) {
  console.error("✗ structure: loose top-level module(s) break the by-domain layout:");
  for (const v of violations) console.error(`    ${v}`);
  console.error(
    "  Move each into a domain folder — server: core/ (+core/http/), integrations/<name>/,",
  );
  console.error(
    "  features/<domain>/, mcp-tools/, cli/ · client: core/ or features/<domain>/. See .claude/CLAUDE.md → Layout.",
  );
}
if (violations.length || hubViolations.length) process.exit(1);
console.log(
  "ok  ui/server and ui/client hold only domain folders (no stray top-level modules); ui/hub holds only its page.",
);
