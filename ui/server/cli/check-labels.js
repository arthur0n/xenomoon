#!/usr/bin/env node
// check:labels — the framework's prose may only name labels the framework actually creates.
//
// The gates match label names EXACTLY (`commit-gate.sh` greps for `qa:pass`, the skills tell agents
// to apply `review:changes`). Those names live as string literals in ~40 files, and until
// `issuekit-labels.js` there was no declaration to check them against — which is how one project
// ended up with `codex:*-pass` labels no stage reads and another kept `analyzed` from a stage that
// no longer exists.
//
// So this fails the build when the framework's own text names a label that:
//   - is RETIRED (the stage that wrote it is gone), or
//   - belongs to a CORE-owned family (`qa:` `review:` `sev:`) but is not in the canonical set.
//
// It deliberately does NOT police everything that looks like a label:
//   - `codex:review`, `codex:setup` … are slash commands, not labels
//   - `uat:*` WAS pack-owned and inconsistent (one pack distinguished FAIL from BLOCKED, the other
//     was binary). The UAT stage is CORE now, so the three-value vocabulary is canonical and this
//     gate enforces it — that is the promise this comment used to make
//   - `needs-deploy` / `needs-build` / `needs-migration` are ship labels each pack owns
import { readdirSync, readFileSync, statSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PIPELINE_LABELS, ISSUEKIT_LABELS, RETIRED_LABELS } from "./issuekit-labels.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Where the framework's own text lives. A bound clone's install output under plugin/ is included
 * deliberately — a pack that ships a stale label name is exactly what this catches. */
const SCAN = ["plugin", "domains", "ui/orchestrator-spine.md", "ui/codex-block.md", "docs"];
const SKIP_DIRS = new Set(["node_modules", ".git", "logs", "vendor"]);
const TEXT = /\.(md|sh|json|js)$/;

/** Families CORE owns end-to-end: if the framework writes one of these, it must be canonical. */
const CORE_FAMILIES = ["qa", "review", "sev", "uat"];
const canonical = new Set([...PIPELINE_LABELS, ...ISSUEKIT_LABELS].map((l) => l.name));
const retired = new Map(RETIRED_LABELS.map((r) => [r.name, r.why]));

/** A label name is a LITERAL, never a pattern: `codex:solution-pass` has a `-`, and a future
 * retired name could carry `+` or `.` and either miss silently or refuse to compile. */
const escape = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A CORE label token is read by EXCLUSION, in one rule: everything up to whitespace or a quote
// belongs to the literal, and only TRAILING punctuation is trimmed back off.
//
// An allowlist of "characters a label may contain" is the wrong model — whatever it omits becomes a
// silent bypass, because `qa:pass+foo` would match the canonical prefix `qa:pass` and be approved
// while every gate grepping the exact string sees nothing. Terminating on punctuation is the same
// mistake one level down (`qa:pass..old` would truncate), so punctuation only ends the token when
// nothing but punctuation follows it.
//
// One carve-out, for a shape this repo's own hooks contain: a slash before another CORE family is
// prose meaning "both of these" (`qa:pass/review:pass`), not one label.
// `<` opens a template placeholder (`sev:<level>`), which is a family mention, not a label.
const HARD_BOUNDARY = /[\s`'"“”‘’<]/;
const TRAILING_PUNCT = /[.,;!?)\]}>|*]+$/;
const families = CORE_FAMILIES.join("|");
const PREFIX_RE = new RegExp(`\\b(${families}):`, "gi");
const FAMILY_CONTINUES = new RegExp(`^(?:${families}):`, "i");

const RETIRED_RE = new RegExp(
  `(?<![\\w-])(${[...retired.keys()].map(escape).join("|")})(?![\\w-])`,
  "g",
);

/** Read one label token starting at `from` (the index of its family prefix).
 * @param {string} line @param {number} from @returns {string} */
function readToken(line, from) {
  let i = from;
  while (i < line.length) {
    const c = line[i] ?? "";
    if (HARD_BOUNDARY.test(c)) break;
    if (c === "/" && FAMILY_CONTINUES.test(line.slice(i + 1))) break;
    i++;
  }
  // `(qa:pass)`, `**qa:pass**`, `apply qa:pass.` — the punctuation is the prose's, not the label's.
  return line.slice(from, i).replace(TRAILING_PUNCT, "");
}

/**
 * Every violation in one file's text. Pure, so the rules can be tested without a tree to scan.
 * @param {string} text @param {string} rel
 * @param {{ canonical: Set<string>, retiredWhy: Map<string, string>, prefixRe: RegExp, retiredRe: RegExp }} rules
 * @returns {string[]}
 */
export function scanText(text, rel, rules) {
  /** @type {string[]} */
  const found = [];
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(rules.prefixRe)) {
      const token = readToken(line, m.index);
      // `qa:*`, `sev:*`, or a bare `**QA:**` heading names the FAMILY, not a label. Nothing
      // follows the colon, so there is no name to check against the canonical set.
      if (/:$/.test(token)) continue;
      if (!rules.canonical.has(token))
        found.push(`${rel}:${i + 1}  unknown CORE label \`${token}\` — not in the canonical set`);
    }
    for (const m of line.matchAll(rules.retiredRe))
      found.push(`${rel}:${i + 1}  RETIRED label \`${m[0]}\` — ${rules.retiredWhy.get(m[0])}`);
  });
  return found;
}

/** Build the matchers for an arbitrary label set — the CLI uses the framework's, tests use their own.
 * @param {string[]} retiredNames */
export function buildMatchers(retiredNames) {
  return {
    prefixRe: new RegExp(`\\b(${families}):`, "gi"),
    retiredRe: new RegExp(`(?<![\\w-])(${retiredNames.map(escape).join("|")})(?![\\w-])`, "g"),
  };
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (TEXT.test(e.name)) out.push(full);
  }
  return out;
}

// ── CLI half. Guarded so importing this module (the tests do) scans nothing and prints nothing.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();

function main() {
  /** @type {string[]} */
  const files = [];
  for (const target of SCAN) {
    const full = path.join(ROOT, target);
    try {
      files.push(...(statSync(full).isDirectory() ? walk(full) : [full]));
    } catch {
      /* absent in an unbound trunk — not an error */
    }
  }

  /** @type {string[]} */
  const errors = [];
  for (const file of files) {
    // This checker names retired labels in order to detect them; it is not a violation.
    if (
      path.basename(file).startsWith("check-labels") ||
      path.basename(file).startsWith("issuekit-labels")
    )
      continue;
    errors.push(
      ...scanText(readFileSync(file, "utf8"), path.relative(ROOT, file), {
        canonical,
        retiredWhy: retired,
        prefixRe: PREFIX_RE,
        retiredRe: RETIRED_RE,
      }),
    );
  }

  if (errors.length) {
    console.error("FAIL: the framework names labels it does not create —\n");
    for (const e of errors) console.error("  " + e);
    console.error(
      `\n${errors.length} problem(s). The canonical set is ui/server/cli/issuekit-labels.js:` +
        " add the label there, or stop naming it.",
    );
    process.exit(1);
  }
  console.log(
    `ok  labels: ${files.length} files name only canonical labels (${canonical.size} declared, ${retired.size} retired and absent).`,
  );
}
