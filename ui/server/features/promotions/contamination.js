// Shared project-contamination scanner — the deterministic half of the "is this capability
// AGNOSTIC?" rubric the audit used to eyeball by hand. plugin/ ships into EVERY install, so a
// promoted or directly-authored skill/agent/tool must carry NO project-specific facts. One scanner,
// run at BOTH seams so contamination cannot enter the spine:
//   • promote  (promote-run.js)      — hard-block a project-coupled capability at the
//     project→plugin boundary
//   • validate (cli/gen-contamination.js) — catch capabilities authored DIRECT-TO-PLUGIN (bypassing
//     promote entirely) over the plugin's own skills/agents/tools
//
// Generalizes the old tools-only `gameDomainRef` (res://-only): now runs for all kinds and adds
// absolute paths, sibling-project refs, and provenance. It flags only DETERMINISTIC,
// low-false-positive signals plus the bound project's derived proper-noun denylist — fuzzy
// proper-noun judgment past the denylist stays the audit's job. The res:// signals are upstream
// (engine) heritage: inert for node projects, kept for the sync seam; res:// is checked for TOOLS
// only, where a hardcoded resource genuinely breaks other installs' gates.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../../lib/json.js";

// res:// refs every install shares — legitimate in a universal tool. Anything else is project-specific.
export const UNIVERSAL_RES = [
  /^res:\/\/main\.tscn\b/,
  /^res:\/\/assets\//,
  /^res:\/\/x-shared-assets\//,
  /^res:\/\/\.godot\//,
  /^res:\/\/addons\//,
];
// Literal engine resource refs (a `$VAR`/arg-built path like `res://$SCENE` has no literal
// extension here, so a tool that takes its scene as a parameter is correctly seen as universal).
const RES_REF = /res:\/\/[A-Za-z0-9_./-]+\.(?:tscn|tres|escn|glb|gltf)\b/g;

// Historical fixed denylist — EMPTY now: the bound project's proper nouns are derived per
// project by `denylistFor()` and passed in via `opts.denylist` (the always-on privacy FLOOR),
// so the gate follows whatever project is bound instead of a stale hardcoded project. Kept as an
// export for compatibility with upstream-synced callers.
/** @type {string[]} */
export const GAME_CODENAMES = [];

/** The bound project's own proper nouns — the deterministic privacy floor every scan gets:
 * the project dir's basename + its package.json `name`. Callers may concat extra terms (e.g. a
 * `contamination.denylist` array from .xenomoon.json). Pure read, no config.js dependency.
 * @param {string} projectDir @returns {string[]} lowercase terms, junk filtered */
export function denylistFor(projectDir) {
  /** @type {string[]} */
  const terms = [path.basename(projectDir)];
  try {
    const pkg = /** @type {{ name?: string }} */ (
      parseJSON(readFileSync(path.join(projectDir, "package.json"), "utf8"))
    );
    if (pkg.name) terms.push(pkg.name.replace(/^@[^/]+\//, ""));
  } catch {
    /* no package.json — the basename still stands */
  }
  // 3+ chars and not a generic word — a one-letter or "app"-ish name would flood the gate.
  const generic = new Set(["app", "web", "api", "site", "game", "project", "src", "main"]);
  return [...new Set(terms.map((t) => t.toLowerCase()))].filter(
    (t) => t.length >= 3 && !generic.has(t),
  );
}

/** Verbatim lines from the project CLAUDE.md's `## Business rules` / `## Data model` blocks —
 * the opt-in leakage signal (a promoted artifact reproducing one of these lines verbatim is
 * carrying THIS project's facts). Degrades to [] when the headings are absent — the denylist
 * floor still applies; /onboard adds the headings to projects missing them.
 * @param {string} projectDir @returns {string[]} */
export function businessTermsFor(projectDir) {
  let text;
  try {
    text = readFileSync(path.join(projectDir, "CLAUDE.md"), "utf8");
  } catch {
    return [];
  }
  /** @type {string[]} */
  const terms = [];
  const re = /^##\s+(?:Business rules|Data model)[^\n]*\n([\s\S]*?)(?=^## |\n*$)/gim;
  for (const m of text.matchAll(re))
    for (const line of (m[1] ?? "").split("\n")) {
      const t = line.replace(/^[-*]\s+/, "").trim();
      if (t.length >= 25) terms.push(t); // short fragments would false-positive
    }
  return terms;
}

// A hardcoded absolute filesystem path (a res:// or project-relative path is required instead).
const ABS_PATH = /(?:\/Users\/|\/home\/[a-z]|\b[A-Za-z]:\\)/;
// A ref into the sibling project dir the framework points at (`../game`) — one project's tree.
const SIBLING_GAME = /\.\.\/game\b/;
// Provenance tying a technique to ONE specific repo/project instead of stating it agnostically.
const PROVENANCE =
  /\b(?:proven|verified|tested|shipped)\s+(?:on|in)\s+this\s+(?:repo|game|project)\b/i;
// Mapping language — a shipped RECORD judging content against ONE project's stack ("valid for our
// game/stack") is project-coupled by construction; digests that map a source belong project-local
// (design/library/transcripts/), only agnostic records ship. RECORDS-ONLY (opts.checkMapping):
// an agent/skill prompt saying "our stack" is agnostic — it resolves to whatever project the
// session points at — so this signal must never run over the promotable kinds.
const OUR_MAPPING = /\bour\s+(?:game|stack|project|repo|codebase)\b/i;

/** @typedef {{ signal: string, match: string, hint: string }} Contamination */

/** The per-project privacy floor: denylisted proper nouns + verbatim business-rule lines.
 * Split out of scanText to keep it under the complexity cap.
 * @param {string} text @param {{ denylist?: string[], businessTerms?: string[] }} opts
 * @param {Contamination[]} hits */
function scanProjectTerms(text, opts, hits) {
  const lower = text.toLowerCase();
  for (const term of [...GAME_CODENAMES, ...(opts.denylist ?? [])])
    if (lower.includes(term))
      hits.push({
        signal: "codename",
        match: term,
        hint: `project-specific proper noun "${term}" — strip it to the agnostic method; the project's own facts live project-local, not in the plugin.`,
      });
  for (const term of opts.businessTerms ?? [])
    if (text.includes(term)) {
      hits.push({
        signal: "business-rule-leak",
        match: term.slice(0, 60),
        hint: "reproduces a project business-rule/data-model line verbatim — project facts NEVER ship in the plugin (updates-routing.md: PROJECT scope). Restate the technique agnostically.",
      });
      break; // one leaked line is enough to block
    }
}

/** Scan one text blob for contamination signals.
 * @param {string} text
 * @param {{ checkRes?: boolean, checkMapping?: boolean, denylist?: string[], businessTerms?: string[] }} [opts]
 *   checkRes: also flag non-universal res:// refs — pass for TOOLS only (skills/agents cite
 *   res:// convention paths as legitimate illustrative examples). checkMapping: also flag
 *   one-project mapping language ("our project/stack") — pass for shipped RECORDS only (library/),
 *   never the promotable kinds. denylist: the bound project's proper nouns (see denylistFor —
 *   the caller reads, the scanner stays pure). businessTerms: verbatim project business-rule
 *   lines (see businessTermsFor) — a reproduced line means project facts are leaking.
 * @returns {Contamination[]} */
export function scanText(text, opts = {}) {
  /** @type {Contamination[]} */
  const hits = [];
  const abs = text.match(ABS_PATH);
  if (abs)
    hits.push({
      signal: "absolute-path",
      match: abs[0],
      hint: "hardcoded absolute filesystem path — use a project-relative path so it resolves in any checkout.",
    });
  const sib = text.match(SIBLING_GAME);
  if (sib)
    hits.push({
      signal: "sibling-game",
      match: sib[0],
      hint: "reaches into the sibling project dir — the plugin ships to every install and must not reference one project's tree.",
    });
  const prov = text.match(PROVENANCE);
  if (prov)
    hits.push({
      signal: "provenance",
      match: prov[0],
      hint: "provenance tied to a specific repo/project — state the technique agnostically (the project's own record lives project-local).",
    });
  if (opts.checkMapping) {
    const map = text.match(OUR_MAPPING);
    if (map)
      hits.push({
        signal: "one-project-mapping",
        match: map[0],
        hint: "one-project mapping language in a shipped record — a digest that judges content against THIS project's stack lives project-local (design/library/transcripts/), only agnostic records ship in the plugin library.",
      });
  }
  scanProjectTerms(text, opts, hits);
  if (opts.checkRes)
    for (const ref of text.match(RES_REF) ?? [])
      if (!UNIVERSAL_RES.some((re) => re.test(ref))) {
        hits.push({
          signal: "project-res-ref",
          match: ref,
          hint: `project-specific resource ${ref} — plugin/tools/ ships to EVERY install, so this fails other installs' gates on the missing resource. Parameterize the resource (read it from an arg / the manifest) so it has no hardcoded path. See plugin/docs/process/promotion.md → "Tool domains".`,
        });
        break; // one non-universal res:// ref is enough to mark the tool project-specific
      }
  return hits;
}

/** Every file at `p` (a single file, or all files under a directory). @param {string} p @returns {string[]} */
export function filesUnder(p) {
  if (!statSync(p).isDirectory()) return [p];
  /** @type {string[]} */
  const out = [];
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const f = path.join(p, e.name);
    if (e.isDirectory()) out.push(...filesUnder(f));
    else if (e.isFile()) out.push(f);
  }
  return out;
}

/** Scan a path (a file, or every file under a directory) for contamination.
 * @param {string} p
 * @param {{ checkRes?: boolean, checkMapping?: boolean, denylist?: string[], businessTerms?: string[], all?: boolean }} [opts]
 *   all: return every hit per file (default: the first hit per file — enough for a promote
 *   hard-block); the rest pass through to scanText.
 * @returns {Array<Contamination & { file: string }>} */
export function scanPath(p, opts = {}) {
  /** @type {Array<Contamination & { file: string }>} */
  const out = [];
  for (const f of filesUnder(p)) {
    let text;
    try {
      text = readFileSync(f, "utf8");
    } catch {
      continue; // binary / unreadable — no literal refs to find
    }
    const hits = scanText(text, opts);
    for (const h of opts.all ? hits : hits.slice(0, 1))
      out.push({ file: f, signal: h.signal, match: h.match, hint: h.hint });
  }
  return out;
}
