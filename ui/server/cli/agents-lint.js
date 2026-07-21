// Agent model/effort policy guard — every agent .md (CORE `plugin/agents/` AND every domain pack
// `domains/*/plugin/agents/`; gen-skill-scope.js deliberately covers CORE only, so this check must
// walk the domain packs itself) is linted against the owner's standing model policy
// (plugin/docs/process/model-effort-policy.md):
//   FAIL — missing `effort`; unknown `model`; opus without effort: high; sonnet+high without an
//          `effort-justification:` note (sonnet is only for quick research or a precisely planned
//          activity — high effort on it needs a stated reason).
//   WARN — haiku above low (haiku = mechanical work); two+ agents sharing a model with no
//          `roster-justification:` note (same-model multiplicity needs parallel-execution or a
//          specialized-prompt case).
// Mirrors structure.check.js: bare-node; wired into `npm run validate`, pre-commit, and CI.
//   node ui/server/cli/agents-lint.js            # --check (default): exits 1 on any violation
//   node ui/server/cli/agents-lint.js --table    # advisory: print the roster table (docs/ROSTER.md)
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MODELS = new Set(["opus", "sonnet", "haiku"]);

/** @typedef {{ name: string, file: string, model: string, effort: string,
 *              effortJustified: boolean, rosterJustified: boolean }} AgentMeta */

/** Agent dirs to scan: CORE plus every domain pack. @returns {string[]} */
function agentDirs() {
  const dirs = [path.join(ROOT, "plugin", "agents")];
  const domains = path.join(ROOT, "domains");
  if (existsSync(domains))
    for (const d of readdirSync(domains, { withFileTypes: true }))
      if (d.isDirectory()) dirs.push(path.join(domains, d.name, "plugin", "agents"));
  return dirs.filter((d) => existsSync(d));
}

/** Parse one agent file's frontmatter + justification notes. @param {string} file @returns {AgentMeta | null} */
function readAgent(file) {
  const text = readFileSync(file, "utf8");
  const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (!fm) return null;
  const field = (/** @type {string} */ k) =>
    fm.match(new RegExp(`^${k}:\\s*(\\S+)`, "m"))?.[1] ?? "";
  return {
    name: field("name") || path.basename(file, ".md"),
    file: path.relative(ROOT, file),
    model: field("model"),
    effort: field("effort"),
    effortJustified: /effort-justification:/.test(text),
    rosterJustified: /roster-justification:/.test(text),
  };
}

/** @type {AgentMeta[]} */
const all = [];
for (const dir of agentDirs())
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const a = readAgent(path.join(dir, f));
    if (a) all.push(a);
  }

/** @type {string[]} */ const errors = [];
/** @type {string[]} */ const warnings = [];

for (const a of all) {
  if (!a.model || !MODELS.has(a.model))
    errors.push(
      `${a.file}: model \`${a.model || "(missing)"}\` — must be one of ${[...MODELS].join("/")}`,
    );
  if (!a.effort)
    errors.push(`${a.file}: missing \`effort\` — every agent declares its effort explicitly`);
  if (a.model === "opus" && a.effort !== "high")
    errors.push(
      `${a.file}: opus must run effort: high (policy: opus = judgment work, never throttled)`,
    );
  if (a.model === "sonnet" && a.effort === "high" && !a.effortJustified)
    errors.push(
      `${a.file}: sonnet + effort: high needs an \`effort-justification:\` note ` +
        `(sonnet is for quick research or a precisely planned activity — say why high)`,
    );
  if (a.model === "haiku" && a.effort && a.effort !== "low")
    warnings.push(`${a.file}: haiku above effort: low — haiku is for mechanical, no-judgment work`);
}

// Same-model multiplicity: flag models carried by 2+ agents where any of them lacks a
// roster-justification (parallel execution or a specialized prompt substituting for skills).
/** @type {Map<string, AgentMeta[]>} */
const byModel = new Map();
for (const a of all) byModel.set(a.model, [...(byModel.get(a.model) ?? []), a]);
for (const [model, group] of byModel)
  if (group.length > 1)
    for (const a of group)
      if (!a.rosterJustified)
        warnings.push(
          `${a.file}: shares model \`${model}\` with ${group.length - 1} other agent(s) but has no ` +
            `\`roster-justification:\` note (justify: parallel execution, or a specialized prompt)`,
        );

if (process.argv.includes("--table")) {
  console.log("| agent | model | effort | file |");
  console.log("|---|---|---|---|");
  for (const a of [...all].sort((x, y) => x.file.localeCompare(y.file)))
    console.log(`| ${a.name} | ${a.model} | ${a.effort} | ${a.file} |`);
}

for (const w of warnings) console.warn(`⚠ agents-lint: ${w}`);
if (errors.length) {
  console.error(`✗ agents-lint: ${errors.length} policy violation(s):`);
  for (const e of errors) console.error(`    ${e}`);
  console.error("  Policy: plugin/docs/process/model-effort-policy.md · roster: docs/ROSTER.md");
  process.exit(1);
}
console.log(
  `ok  agents-lint: ${all.length} agents, model/effort policy satisfied` +
    (warnings.length ? ` (${warnings.length} warning(s) above)` : ""),
);
