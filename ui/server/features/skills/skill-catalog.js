// Skill catalog — the ONE source of truth for the built-in Claude Code skill names and the
// workspace-skill reader. Kept deliberately dependency-light (only node:fs/os/path): it must NOT
// pull in core/config.js, whose import has load-time side effects (it resolves the active domain and
// can process.exit on a bad --allow). That side-effect chain is fine for the
// server but wrong for the standalone `cli/skill-setup.js`, which is why the built-in list used to
// be duplicated there. Both skills.js (server feature) and cli/skill-setup.js import it instead, so
// the list lives in exactly one place and can't drift.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { readSkills } from "./skill-registry.js";

/** Known Claude Code built-in skill names. Update when Claude Code ships new ones.
 * @type {string[]} */
export const BUILTIN_SKILLS = [
  "claude-api",
  "code-review",
  "deep-research",
  "fewer-permission-prompts",
  "grill-me",
  "handoff",
  "init",
  "keybindings-help",
  "loop",
  "review",
  "run",
  "schedule",
  "security-review",
  "simplify",
  "verify",
  "write-a-skill",
];

/** Framework (plugin) skills the orchestrator / main session sees — DERIVED LIVE from the skill tags,
 * not a hardcoded list: a framework skill is on the hive floor iff its `agents:` tag names
 * `orchestrator` (or `all`). This is what makes the hive editable from the Skills UI — toggling a
 * skill onto/off the orchestrator rewrites its tag, and this reads that tag next session (no code edit,
 * no drift for gen-skill-scope to catch). Read from the single `plugin/` tree; domain skills target
 * implementer agents (never `orchestrator`), so they never leak onto the hive floor. Always enabled
 * regardless of skillOverrides — these are the routing floor. @returns {string[]} */
export function orchestratorFrameworkSkills() {
  /** @type {string[]} */
  const out = [];
  for (const [name, tokens] of readSkills())
    if (tokens.includes("orchestrator") || tokens.includes("all")) out.push(name);
  return out.sort();
}

/** Claude Code BUILT-IN skills the orchestrator must ALWAYS have, regardless of skillOverrides —
 * the user can't toggle these off, and they're never offered to sub-agents (which get only their
 * own frontmatter `skills:`). Kept SEPARATE from ORCHESTRATOR_FRAMEWORK_SKILLS because these are
 * builtins, NOT plugin skills on disk, so gen-skill-scope.js must not cross-check them; they're
 * also intentionally absent from BUILTIN_SKILLS so they never render as a toggleable candidate.
 * resolveSessionSkills folds them into the orchestrator floor. `update-config`: the hive owns
 * harness configuration (settings.json hooks/permissions/env), so config authoring is hive-only.
 * @type {string[]} */
export const REQUIRED_ORCHESTRATOR_BUILTINS = ["update-config"];

/** Parse the first `name:` and `description:` values from YAML frontmatter.
 * @param {string} text @returns {{ name: string, description: string } | null} */
function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match?.[1]) return null;
  const block = match[1];
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!name) return null;
  return { name, description: description ?? "" };
}

/** Workspace skills found in ~/.claude/commands/ on this machine.
 * @returns {{ name: string, description: string }[]} */
export function getWorkspaceSkills() {
  const dir = path.join(homedir(), ".claude", "commands");
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .flatMap((f) => {
        try {
          const text = readFileSync(path.join(dir, f), "utf8");
          const fm = parseFrontmatter(text);
          if (fm) return [fm];
          return [{ name: f.replace(/\.md$/, ""), description: "" }];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}
