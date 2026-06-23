// Health check for a game driven by the framework. Verifies the framework SOURCE (the
// xenomoon plugin) is intact, the game is a valid engine project, and the per-game working
// files (tools copied, library linked) are materialized. Materializes first (idempotent),
// then checks. Exits non-zero on any HARD failure so it can gate `new` and CI.
//
// Usage: npm run doctor                  (the configured game, see config.js)
//        npm run doctor -- /path/to/game
//        node ui/server/cli/doctor.js /path/to/game
import { existsSync, readdirSync, lstatSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  PROJECT_DIR,
  FRAMEWORK_PLUGIN_DIR,
  ENGINE,
  ENGINE_LABEL,
  DOMAIN,
  RES_ASSET_MOUNT,
} from "../core/config.js";
import { prepareGame } from "./materialize.js";
import { readPromotions, approvedPending } from "../features/promotions/promotions-store.js";

/** Count files with a suffix in a dir (0 if missing). @param {string} dir @param {string} suffix */
function countFiles(dir, suffix) {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(suffix)).length;
  } catch {
    return 0;
  }
}

/** Count immediate subdirectories (0 if missing). @param {string} dir */
function countDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  } catch {
    return 0;
  }
}

/** @returns {boolean} */
function hasRtk() {
  try {
    execFileSync("rtk", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** @returns {boolean} */
function libraryLinked() {
  try {
    return lstatSync(path.join(PROJECT_DIR, "library")).isSymbolicLink();
  } catch {
    return false;
  }
}

/** @returns {boolean} */
function assetLibraryLinked() {
  try {
    return lstatSync(path.join(PROJECT_DIR, RES_ASSET_MOUNT)).isSymbolicLink();
  } catch {
    return false;
  }
}

// Bring the game's generated files up to date (tools copied, library linked), then check.
prepareGame(PROJECT_DIR);

const pluginAgents = countFiles(path.join(FRAMEWORK_PLUGIN_DIR, "agents"), ".md");
const pluginSkills = countDirs(path.join(FRAMEWORK_PLUGIN_DIR, "skills"));
const pluginCommands = countFiles(path.join(FRAMEWORK_PLUGIN_DIR, "commands"), ".md");

/** @type {{ ok: boolean, hard: boolean, label: string }[]} */
const checks = [
  {
    ok: existsSync(path.join(FRAMEWORK_PLUGIN_DIR, ".claude-plugin", "plugin.json")),
    hard: true,
    label: "xenomoon plugin manifest present",
  },
  {
    // A populated domain must ship SOME capability (agents / skills / commands); an empty domain
    // starts with none and learns them per project — so this is HARD only when populated.
    ok: DOMAIN.populated ? pluginAgents > 0 || pluginSkills > 0 || pluginCommands > 0 : true,
    hard: DOMAIN.populated,
    label: DOMAIN.populated
      ? `plugin capabilities (${pluginAgents} agents, ${pluginSkills} skills, ${pluginCommands} commands)`
      : `${DOMAIN.label} domain starts empty (0 agents, 0 skills) — learns the project`,
  },
  {
    ok: existsSync(path.join(PROJECT_DIR, ENGINE.projectFile)),
    hard: true,
    label: `${ENGINE.projectFile} present (${ENGINE_LABEL} project)`,
  },
  {
    // Only a domain that materializes tools INTO the project (Godot's tools/validate.sh verify
    // gate) has this to check; a domain that verifies via package scripts (Node) materializes
    // nothing, so it's N/A there. HARD only when the domain writes tools into the project.
    ok: DOMAIN.materializeIntoProject
      ? existsSync(path.join(PROJECT_DIR, "tools", "validate.sh"))
      : true,
    hard: DOMAIN.materializeIntoProject,
    label: DOMAIN.materializeIntoProject
      ? "tools/ materialized into the project (gitignored)"
      : `${DOMAIN.label} verifies via package scripts (no materialized tools/)`,
  },
  {
    // Only the Godot family runs an external engine binary; other runtimes (Node) drive their
    // toolchain through package scripts, so there is no $GODOT to resolve.
    ok: DOMAIN.engine.needsBinary ? Boolean(ENGINE.bin) : true,
    hard: false,
    label: !DOMAIN.engine.needsBinary
      ? `${ENGINE_LABEL} toolchain via package scripts (no engine binary needed)`
      : ENGINE.bin
        ? `${ENGINE_LABEL} binary resolved ($GODOT=${ENGINE.bin})`
        : `${ENGINE_LABEL} binary not found — set GODOT=/path/to/${ENGINE.name} (agents will re-derive it per call)`,
  },
  // The materialized-into-project artifacts (facts manifest, library + asset symlinks) only exist
  // for a domain that opts into writing files into the project tree (Godot). Omit the rows entirely
  // for a domain that materializes nothing, rather than show them perpetually "—".
  ...(DOMAIN.materializeIntoProject
    ? [
        {
          ok: existsSync(path.join(PROJECT_DIR, ".xenomoon", "manifest.json")),
          hard: false,
          label: "facts manifest generated (.xenomoon/manifest.json)",
        },
        { ok: libraryLinked(), hard: false, label: "library/ symlinked to the plugin" },
        {
          ok: assetLibraryLinked(),
          hard: false,
          label: `${RES_ASSET_MOUNT}/ symlinked to the external asset library`,
        },
      ]
    : []),
  { ok: hasRtk(), hard: false, label: "rtk on PATH (optional — hook no-ops without it)" },
];

console.log(`doctor: checking ${PROJECT_DIR}`);
let hardFails = 0;
for (const c of checks) {
  const mark = c.ok ? "✓" : c.hard ? "✗" : "—";
  console.log(`  ${mark} ${c.label}`);
  if (!c.ok && c.hard) hardFails += 1;
}

// Soft: surface pending promotion requests so an approved capability never sits
// un-promoted just because the chat scrolled away (see promotions-store.js).
const requested = readPromotions().filter((p) => p.status === "requested").length;
const approved = approvedPending().length;
if (requested || approved) {
  console.log(
    `  ⇧ promotions: ${requested} awaiting a decision, ${approved} approved — ` +
      "run `npm run promote -- --pending` to apply the approved ones.",
  );
}

if (hardFails > 0) {
  console.error(`doctor: ${hardFails} hard check(s) failed.`);
  process.exit(1);
}
console.log("doctor: OK");
console.log(
  "  Terminal use: install the plugin once —\n" +
    "    /plugin marketplace add " +
    path.dirname(FRAMEWORK_PLUGIN_DIR) +
    "\n    /plugin install xenomoon@xenomoon-forge\n" +
    "  (The web UI loads the plugin automatically — no install needed.)",
);
