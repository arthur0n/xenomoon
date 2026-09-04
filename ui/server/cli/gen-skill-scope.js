// Skill-scope registry guard — the per-agent skill index is DECLARED once (each
// plugin/skills/*/SKILL.md carries an `agents:` tag naming its audience) and PROJECTED into each
// plugin/agents/*.md `skills:` frontmatter (what the SDK reads as AgentDefinition.skills). This checks
// the two stay in sync, so the "only required skills per agent" scoping can't silently drift. The read
// + inversion core lives in ui/server/features/skills/skill-registry.js (shared with the set_skill tool
// + the recalibration UI). Mirrors structure.check.js: bare-node; wired into `npm run validate`, the
// pre-commit hook, and CI.
//   node ui/server/cli/gen-skill-scope.js            # --check (default): exits 1 on any drift
//   node ui/server/cli/gen-skill-scope.js --write     # advisory: print the projected skills: blocks
//
// Tag vocabulary (in a skill's `agents: [...]`): bare agent names, plus reserved tokens —
//   all          → the orchestrator + every agent
//   subagents    → every agent, but NOT the orchestrator (e.g. caveman-forge — terse sub-agent output)
//   workers      → every agent that manages the board (has the mcp__ui__tasks tool)
//   builders     → the active domain's general builder + its specialists (the code-writers)
//   orchestrator → the main session only (cross-checked against ORCHESTRATOR_FRAMEWORK_SKILLS)
import { orchestratorFrameworkSkills } from "../features/skills/skill-catalog.js";
import {
  ORCH,
  BUILDERS_SOURCE,
  loadRegistry,
  SKILLS_DIR,
} from "../features/skills/skill-registry.js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const { skills, agents, agentNames, expected, errors } = loadRegistry();
const onDisk = new Set(skills.keys());
/** @type {string[]} */ const warnings = [];

/** Set difference a − b as a sorted array. @param {Set<string>} a @param {Set<string>} b */
const minus = (a, b) => [...a].filter((x) => !b.has(x)).sort();

/** Body references to skills near a load/follow verb, or `name` skill mentions. @param {string} body */
function bodySkillRefs(body) {
  /** @type {Set<string>} */
  const refs = new Set();
  for (const m of body.matchAll(/(?:load|follow)\b[^.\n]*?`([a-z][a-z0-9-]+)`/g))
    if (m[1]) refs.add(m[1]);
  for (const m of body.matchAll(/`([a-z][a-z0-9-]+)`(?:\*{1,2}|_)?\s+skill\b/g))
    if (m[1]) refs.add(m[1]);
  return refs;
}

// Actual skills: per audience (the orchestrator's set is the framework constant).
/** @type {Map<string, Set<string>>} */
const actual = new Map();
actual.set(ORCH, new Set(orchestratorFrameworkSkills()));
for (const n of agentNames) actual.set(n, new Set(agents.get(n)?.skills));

// Skills a PACK installed, read from the generated install manifest. A CORE agent cannot enumerate
// them — which pack is installed is a per-clone choice, and naming one would put a domain's name
// inside a CORE file. So they are exempt from the projection below: the pack targets the agent
// (`agents: [builders]` / an agent name), the agent stays domain-neutral, and the skill is loaded
// on demand rather than preloaded. Everything CORE-owned stays strictly projected.
const installed = (() => {
  /** @type {Set<string>} */
  const out = new Set();
  try {
    for (const line of readFileSync(path.join(SKILLS_DIR, "..", ".gitignore"), "utf8").split(
      "\n",
    )) {
      const m = line.trim().match(/^\/?skills\/([^/]+)\/SKILL\.md$/);
      if (m?.[1]) out.add(m[1]);
    }
  } catch {
    /* no manifest — an unbound trunk installs nothing, so nothing is exempt */
  }
  return out;
})();

// Which AGENTS the install wrote. The exemptions below apply only to CORE-owned agents: a CORE
// agent genuinely cannot enumerate per-clone pack content. A PACK-owned agent has no such excuse —
// the pack ships the agent AND its skills, so the two must agree exactly, or a pack could quietly
// ship a lane whose skills never preload while this gate reported "in sync".
const installedAgents = (() => {
  /** @type {Set<string>} */
  const out = new Set();
  try {
    for (const line of readFileSync(path.join(SKILLS_DIR, "..", ".gitignore"), "utf8").split(
      "\n",
    )) {
      const m = line.trim().match(/^\/?agents\/([^/]+)\.md$/);
      if (m?.[1]) out.add(m[1]);
    }
  } catch {
    /* no manifest — nothing installed, so every agent is CORE-owned */
  }
  return out;
})();
const isCoreAgent = (/** @type {string} */ id) => id !== ORCH && !installedAgents.has(id);

// Every skill name ANY pack ships. In an unbound trunk none are on disk, so a CORE agent naming one
// in prose ("load the `domain-conventions` skill your pack ships") would otherwise read as a
// dangling reference. It is not — it resolves the moment a pack is installed.
const packSlots = (() => {
  /** @type {Set<string>} */
  const out = new Set();
  const domainsDir = path.join(SKILLS_DIR, "..", "..", "domains");
  try {
    for (const pack of readdirSync(domainsDir, { withFileTypes: true })) {
      if (!pack.isDirectory()) continue;
      const dir = path.join(domainsDir, pack.name, "plugin", "skills");
      if (!existsSync(dir)) continue;
      for (const s of readdirSync(dir, { withFileTypes: true }))
        if (s.isDirectory()) out.add(s.name);
    }
  } catch {
    /* no domains/ — nothing ships slots */
  }
  return out;
})();

// A descriptor that exists but cannot be parsed is not "no domain" — it is a broken explicit
// choice, and the gate says so rather than quietly judging the tree as an unbound trunk (the one
// state that tolerates builder drift).
if (BUILDERS_SOURCE === "invalid")
  errors.push(
    "the active domain descriptor could not be read — `.xenomoon.json`'s `domainDescriptor`, or the `domains/<XENOMOON_DOMAIN>/domain.json` it names, is malformed. Fix it: until then the `builders` audience cannot be resolved and this gate cannot judge builder scoping.",
  );

for (const [id, want] of expected) {
  /** @type {Set<string>} */
  const have = actual.get(id) ?? new Set();
  const label =
    id === ORCH
      ? "the orchestrator floor (skills tagged `orchestrator`)"
      : `agent \`${id}\` frontmatter skills:`;
  // D1: every listed skill exists on disk.
  for (const s of have)
    if (!onDisk.has(s)) errors.push(`${label} lists \`${s}\`, which is not a skill on disk`);
  // D2: the projection (skill tags) and the frontmatter must match exactly, both directions —
  //     except for pack-installed skills, which CORE is not allowed to know about (see above).
  for (const s of minus(want, have))
    if (!(installed.has(s) && isCoreAgent(id)))
      errors.push(
        `${label} is missing \`${s}\` (a skill tags this audience but the frontmatter omits it)`,
      );
  for (const s of minus(have, want)) {
    // On a trunk where NO domain answered, `builders` names nobody — CORE ships no builder of its
    // own, each pack declares the cohort. So a CORE builder listing a `builders`-tagged skill looks
    // like drift while nothing is mis-tagged: there is simply no install yet for the token to name.
    // Undecidable, not wrong — reported as a warning so the state stays visible.
    //
    // Keyed on the SOURCE, never on emptiness. A bound domain that declares `builders: []` has
    // answered, and its answer is decidable: an agent listing a builders-tagged skill there is real
    // drift and must still fail. Conflating the two would let a zero-builder pack ship agents
    // preloading skills outside their audience with the gate green.
    if (BUILDERS_SOURCE === "unbound" && (skills.get(s) ?? []).includes("builders")) {
      warnings.push(
        `${label} lists \`${s}\` (tagged \`builders\`) — undecidable on an unbound trunk, where \`builders\` names no agent. Install a domain, or set XENOMOON_DOMAIN, to check it.`,
      );
      continue;
    }
    errors.push(
      `${label} lists \`${s}\`, but \`${s}\`'s \`agents:\` tag does not include this audience`,
    );
  }
}

// Self-check: keep each context's tier-1 skill INDEX small. Past ~10–15 the always-listed description
// budget bites and selection accuracy erodes as descriptions overlap (the index is the "these exist +
// roughly what they do" signal; full skills load on demand). An over-cap agent is the signal to split
// it into domain-specialized agents (core + domain). 12, not 10 (owner, 2026-09-04): the
// senior-analyst's four pipeline hats + investigation stack sit at 11 by design — one extra
// description per dispatch is cheaper than a roster split.
const INDEX_SOFT_CAP = 12;
for (const [id, have] of actual) {
  if (have.size > INDEX_SOFT_CAP)
    warnings.push(
      `${id === ORCH ? "orchestrator" : `agent \`${id}\``} carries ${have.size} skills in its index ` +
        `(> ${INDEX_SOFT_CAP}) — consider splitting it into domain-specialized agents (core + domain)`,
    );
}

// Naming convention (WARN-ONLY, catches NEW skills; existing names grandfathered): adopt
// `godot-<system>[-<qualifier>]` with the ENGINE VERSION in frontmatter, never baked into the name
// (a name outlives the version it pins). Only the version-in-name half is mechanically checkable —
// qualifier ORDER (hd-material-import vs mesh-import-hd) is authoring judgment the researcher
// prompt owns. Existing violators are grandfathered so the gate doesn't nag the names the finding
// explicitly declined to bulk-rename (review D-14/P2D-3, finding D3-name-qualifier-order).
const VERSION_IN_NAME = /-\d+-\d+/; // two hyphen-joined numeric segments = a dotted version (e.g. -4-6); `3d`/`2d` are letter-suffixed, not matched
const NAME_CONVENTION_GRANDFATHERED = new Set(["godot-navmesh-pathing-4-6"]);
for (const name of onDisk) {
  if (VERSION_IN_NAME.test(name) && !NAME_CONVENTION_GRANDFATHERED.has(name))
    warnings.push(
      `skill \`${name}\` bakes an engine version into its name — new skills use \`godot-<system>[-<qualifier>]\` ` +
        `and put the version in frontmatter (a name outlives the version it pins)`,
    );
}

// Body-reference checks: an agent body that names a skill it doesn't list. Two cases —
//   - the skill EXISTS on disk → ERROR (real drift: the prose claims a skill the agent isn't wired to
//     load). Fix by adding it to skills:, OR — if the skill belongs to another agent and the body is
//     just cross-referencing it — reword the prose so it doesn't read as a self-claim. (You cannot
//     simply add a builder-scoped skill to a non-builder here: that trips the D2 audience check above.)
//   - the skill is NOT on disk and looks project-local (a dashed name — the generic heuristic
//     below) → WARNING (may be a project-local skill in the project's own .claude/skills/).
for (const [name, a] of agents) {
  const listed = new Set(a.skills);
  for (const ref of bodySkillRefs(a.body)) {
    if (onDisk.has(ref)) {
      // A PACK-installed skill is the one thing a CORE agent may name in prose without listing:
      // it cannot list it (the name resolves to different content per pack, and an unbound trunk
      // has none on disk), so it says "load X" and loads it on demand. Same rule as the projection
      // exemption above — CORE never enumerates what a pack installs.
      if (!listed.has(ref) && !(installed.has(ref) && isCoreAgent(name)))
        errors.push(
          `agent \`${name}\` body references the \`${ref}\` skill but its frontmatter skills: omits it ` +
            `(add it to skills:, or reword the prose as a cross-reference if the skill belongs to another agent)`,
        );
    } else if (packSlots.has(ref) && isCoreAgent(name)) {
      // A PACK SLOT: no pack is installed here (an unbound trunk), but some pack ships this exact
      // name, so the reference resolves the moment one is. Expected, not drift — say nothing.
    } else if (/-/.test(ref)) {
      warnings.push(
        `agent \`${name}\` body references \`${ref}\` as a skill, but it is not a FRAMEWORK skill ` +
          `and no domain pack ships it either (may be a project-local skill in the project's ` +
          `.claude/skills/ — a framework agent shouldn't hard-depend on a project-specific skill; ` +
          `and per-agent frontmatter scoping can hide it)`,
      );
    }
  }
}

if (process.argv.includes("--write")) {
  console.log(
    "# Projected skills: blocks (from each skill's agents: tag) — sync agent frontmatter to these:\n",
  );
  for (const id of [ORCH, ...agentNames]) {
    const list = [...(expected.get(id) ?? [])].sort();
    console.log(`## ${id === ORCH ? "orchestrator (floor: skills tagged `orchestrator`)" : id}`);
    console.log(
      id === ORCH ? `  [${list.join(", ")}]` : "skills:\n" + list.map((s) => `  - ${s}`).join("\n"),
    );
    console.log("");
  }
}

for (const w of warnings) console.warn(`⚠ skill-scope: ${w}`);
if (errors.length) {
  console.error(`✗ skill-scope: ${errors.length} drift error(s) in skill scoping:`);
  for (const e of errors) console.error(`    ${e}`);
  console.error(
    "  Fix the skill tag, the agent frontmatter, or the body reference so they agree (run --write to see the expected blocks).",
  );
  process.exit(1);
}
console.log(
  `ok  skill-scope: ${skills.size} skills, ${agentNames.length} agents, scoping in sync` +
    (warnings.length ? ` (${warnings.length} warning(s) above)` : ""),
);
