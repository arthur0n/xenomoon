// Direct-to-plugin contamination gate — the validate-time seam contamination.js always
// promised (its header referenced this file before it existed): capabilities can be authored
// straight into a domain pack (bypassing promote entirely), so the same scanner must also run
// over the packs' OWN skills/library. CORE plugin skills are covered by review + the agnostic
// gate; the domain packs are where per-project learnings land, so they get the record-grade
// scan (checkMapping) here. Bare-node; wired into `npm run validate` and the pr-domain CI gate.
//   node ui/server/cli/gen-contamination.js            # exits 1 on any hit
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanPath } from "../features/promotions/contamination.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli
const FRAMEWORK_DIR = path.join(here, "..", "..", "..");
const DOMAINS_DIR = path.join(FRAMEWORK_DIR, "domains");

/** @type {Array<{ file: string, signal: string, match: string, hint: string }>} */
const hits = [];
if (existsSync(DOMAINS_DIR))
  for (const d of readdirSync(DOMAINS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const sub of ["skills", "library"]) {
      const p = path.join(DOMAINS_DIR, d.name, "plugin", sub);
      if (!existsSync(p)) continue;
      // Library records get the records-only mapping check; skills the universal signals.
      hits.push(...scanPath(p, { checkMapping: sub === "library", all: true }));
    }
  }

if (hits.length) {
  console.error(`✗ contamination: ${hits.length} hit(s) in domain packs:`);
  for (const h of hits)
    console.error(
      `    ${path.relative(FRAMEWORK_DIR, h.file)} — ${h.signal} ("${h.match}")\n      ${h.hint}`,
    );
  process.exit(1);
}
console.log("ok  contamination: domain-pack skills/library are agnostic.");
