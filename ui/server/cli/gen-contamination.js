// Direct-to-plugin contamination gate — the validate-time seam contamination.js always
// promised (its header referenced this file before it existed): capabilities can be authored
// straight into a domain pack (bypassing promote entirely), so the same scanner must also run
// over the packs' OWN skills/library.
//
// It scans BOTH capability trees, because contamination reaches each by a different route:
//   • domains/<pack>/plugin/{skills,library} — authored direct-to-pack, bypassing promote
//   • plugin/{skills,library}                — the INSTALLED tree, where a pack install, a
//     promotion, or a learn-routing draft lands. Leaving it unscanned is not covered by "review + the
//     agnostic gate": that gate reads git-TRACKED files only, so a freshly written record is
//     invisible to it — which is exactly how a bound project's name reached plugin/library/.
// The per-project proper-noun floor (denylistFor) + verbatim business-rule lines
// (businessTermsFor) are derived from the BOUND project and passed in; without them the scanner
// only sees the universal signals and a project name walks straight through. No bound project
// (CI, a fresh clone) → those terms are empty and the universal signals still run.
// Bare-node; wired into `npm run validate` and the pr-domain CI gate.
//   node ui/server/cli/gen-contamination.js            # exits 1 on any hit
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanPath, denylistFor, businessTermsFor } from "../features/promotions/contamination.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli
const FRAMEWORK_DIR = path.join(here, "..", "..", "..");
const DOMAINS_DIR = path.join(FRAMEWORK_DIR, "domains");
const PLUGIN_DIR = path.join(FRAMEWORK_DIR, "plugin");

/** The bound project's dir from the baked descriptor. Read directly (never `config.js` — its
 * import triggers a load-time domain/engine probe, and this must stay runnable in CI where no
 * project is bound). @returns {string} "" when nothing is bound */
function boundProjectDir() {
  try {
    const f = path.join(FRAMEWORK_DIR, ".xenomoon.json");
    if (!existsSync(f)) return "";
    const raw = /** @type {unknown} */ (JSON.parse(readFileSync(f, "utf8")));
    const cfg = /** @type {{ projectDir?: unknown }} */ (raw);
    return typeof cfg.projectDir === "string" ? cfg.projectDir : "";
  } catch {
    return ""; // an unreadable descriptor must never break the gate
  }
}

const projectDir = boundProjectDir();
const denylist = projectDir ? denylistFor(projectDir) : [];
const businessTerms = projectDir ? businessTermsFor(projectDir) : [];

/** Every capability tree this gate scans: [dir, isRecordsTree]. @type {Array<[string, boolean]>} */
const targets = [];
if (existsSync(DOMAINS_DIR))
  for (const d of readdirSync(DOMAINS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const sub of ["skills", "library"])
      targets.push([path.join(DOMAINS_DIR, d.name, "plugin", sub), sub === "library"]);
  }
for (const sub of ["skills", "library"])
  targets.push([path.join(PLUGIN_DIR, sub), sub === "library"]);

/** @type {Array<{ file: string, signal: string, match: string, hint: string }>} */
const hits = [];
for (const [p, isRecords] of targets) {
  if (!existsSync(p)) continue;
  // Library records get the records-only mapping check; skills the universal signals.
  hits.push(...scanPath(p, { checkMapping: isRecords, all: true, denylist, businessTerms }));
}

if (hits.length) {
  console.error(`✗ contamination: ${hits.length} hit(s) in the capability trees:`);
  for (const h of hits)
    console.error(
      `    ${path.relative(FRAMEWORK_DIR, h.file)} — ${h.signal} ("${h.match}")\n      ${h.hint}`,
    );
  process.exit(1);
}
console.log(
  `ok  contamination: pack + CORE skills/library are agnostic${denylist.length ? ` (project terms: ${denylist.join(", ")})` : ""}.`,
);
