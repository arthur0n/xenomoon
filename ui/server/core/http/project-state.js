// Live project inventory — scanned on every /api/state request so it never
// drifts from what's actually on disk.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../../lib/json.js";
import {
  PROJECT_DIR,
  PROJECT_FOUND,
  ENGINE,
  DOMAIN,
  FRAMEWORK_PLUGIN_DIR,
  hermesPublicConfig,
  codexPublicConfig,
  getOnboarded,
} from "../config.js";
import { parseFrontmatter } from "../../../lib/frontmatter.js";

/**
 * @param {string} dir
 * @param {string[]} exts
 * @param {string[]} [out]
 * @param {string} [base]
 * @param {Set<string>} [ignore] directory names to skip (e.g. node_modules, dist); dot-dirs are always skipped
 * @returns {string[]}
 */
function walk(dir, exts, out = [], base = dir, ignore) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory() && ignore?.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out, base, ignore);
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(path.relative(base, full));
  }
  return out;
}

/** @param {string} file @returns {string} */
function firstHeading(file) {
  try {
    const line = readFileSync(file, "utf8")
      .split("\n")
      .find((l) => l.startsWith("# "));
    return line ? line.slice(2).trim() : path.basename(file);
  } catch {
    return path.basename(file);
  }
}

/** Collect agents (name + model) across dirs; earlier dirs win on name clash (plugin first,
 * then the project's own unpromoted agents). @param {string[]} dirs */
function collectAgents(dirs) {
  /** @type {Map<string, { name: string, model: string | null }>} */
  const seen = new Map();
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      if (!f.endsWith(".md")) continue;
      const name = f.replace(/\.md$/, "");
      if (seen.has(name)) continue;
      let model = null;
      try {
        model = readFileSync(path.join(d, f), "utf8").match(/^model:\s*(\S+)/m)?.[1] ?? null;
      } catch {
        /* unreadable — leave model null */
      }
      seen.set(name, { name, model });
    }
  }
  return [...seen.values()];
}

/** Collect skill folder names across dirs (deduped, plugin first). @param {string[]} dirs */
function collectSkills(dirs) {
  /** @type {Set<string>} */
  const seen = new Set();
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const e of readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) seen.add(e.name);
  }
  return [...seen];
}

/** @returns {import("../../../lib/types.js").ProjectState} */
export function projectState() {
  const dir = PROJECT_DIR;
  let name = path.basename(dir);
  try {
    const raw = readFileSync(path.join(dir, ENGINE.projectFile), "utf8");
    // package.json (Node/webapp) → "name"; the reference engine's INI project file → config/name="…".
    if (ENGINE.projectFile.endsWith(".json")) {
      const pkg = /** @type {{ name?: unknown }} */ (parseJSON(raw));
      if (typeof pkg.name === "string" && pkg.name) name = pkg.name;
    } else {
      const m = raw.match(/config\/name="([^"]+)"/)?.[1];
      if (m) name = m;
    }
  } catch {}
  // Directory names to skip while scanning the project tree (node_modules, dist, …) — keeps a real
  // Node/webapp repo's inventory from drowning in dependency files. A domain may declare none for a
  // whole-tree scan.
  const ignore = new Set(DOMAIN.inventory.ignore);
  return {
    name,
    dir,
    // false → PROJECT_DIR has no engine project file (the domain's marker); the UI shows a setup
    // banner instead of empty panels (see loadState in project-tree.js).
    found: PROJECT_FOUND,
    onboarded: getOnboarded(),
    designDocs: walk(path.join(dir, "design"), [".md"], [], dir)
      .filter((f) => !f.endsWith("README.md"))
      .map((f) => ({ path: f, title: firstHeading(path.join(dir, f)) })),
    // Research record catalog (addon/tool/skill researchers) — records carry OKF-style
    // YAML frontmatter (type/title/description, gated by `npm run check:library`), so the
    // sidebar shows the verdict without opening docs. index.md files are generated
    // navigation, not records.
    library: walk(path.join(dir, "library"), [".md"], [], dir)
      .filter((f) => !f.endsWith("README.md") && !f.endsWith("index.md"))
      .map((f) => {
        const full = path.join(dir, f);
        /** @type {import("../../../lib/frontmatter.js").FrontmatterData | null} */
        let fm = null;
        try {
          fm = parseFrontmatter(readFileSync(full, "utf8")).data;
        } catch {}
        return {
          path: f,
          title: typeof fm?.title === "string" && fm.title ? fm.title : firstHeading(full),
          type: typeof fm?.type === "string" && fm.type ? fm.type : null,
          description:
            typeof fm?.description === "string" && fm.description ? fm.description : null,
        };
      }),
    scenes: walk(dir, DOMAIN.inventory.scenes, [], dir, ignore),
    scripts: walk(dir, DOMAIN.inventory.scripts, [], dir, ignore),
    // Capabilities come from the xenomoon plugin (the framework source); a project may also
    // carry its own unpromoted agents/skills in .claude/. Show both, plugin first.
    agents: collectAgents([
      path.join(FRAMEWORK_PLUGIN_DIR, "agents"),
      path.join(dir, ".claude", "agents"),
    ]),
    skills: collectSkills([
      path.join(FRAMEWORK_PLUGIN_DIR, "skills"),
      path.join(dir, ".claude", "skills"),
    ]),
    // External Hermes researcher config for the settings panel — key-free (hasKey only).
    hermes: hermesPublicConfig(),
    // Optional Codex reviewer config for the settings panel — secret-free (enabled + vendored).
    codex: codexPublicConfig(),
  };
}
