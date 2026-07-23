// Health check for a game driven by the framework. Verifies the framework SOURCE (the
// xenomoon plugin) is intact, the game is a valid engine project, and the per-game working
// files (tools copied, library linked) are materialized. Materializes first (idempotent),
// then checks. Exits non-zero on any HARD failure so it can gate `new` and CI.
//
// Usage: npm run doctor                  (the configured game, see config.js)
//        npm run doctor -- /path/to/game
//        node ui/server/cli/doctor.js /path/to/game
import { existsSync, readdirSync, lstatSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  PROJECT_DIR,
  FRAMEWORK_DIR,
  FRAMEWORK_PLUGIN_DIR,
  ENGINE,
  ENGINE_LABEL,
  DOMAIN,
  RES_ASSET_MOUNT,
} from "../core/config.js";
import { parseJSON } from "../../lib/json.js";
import { prepareGame } from "./materialize.js";
import { AGENT_REGISTRY } from "../agents/registry.js";
import { ensureDomainLibrary } from "../features/promotions/ensure-library.js";
import { readPromotions, approvedPending } from "../features/promotions/promotions-store.js";
import { locate } from "../features/promotions/promote-run.js";

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

/** The engines.node floor from package.json, e.g. ">=18". @returns {string} */
function enginesNode() {
  try {
    const pkg = /** @type {{ engines?: { node?: string } }} */ (
      parseJSON(readFileSync(path.join(FRAMEWORK_DIR, "package.json"), "utf8"))
    );
    return pkg.engines?.node ?? ">=18";
  } catch {
    return ">=18";
  }
}

/** @returns {boolean} */
function nodeOk() {
  const major = enginesNode()
    .replace(/[^0-9.]/g, "")
    .split(".")[0];
  const floor = major ? Number(major) : 18;
  return Number(process.versions.node.split(".")[0]) >= floor;
}

/** @returns {boolean} */
function ghAuthOk() {
  try {
    execFileSync("gh", ["auth", "status"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Soft probe rows for the ENABLED paid integrations (hermes/codex/kimi) — data-driven from
 * the agents registry so a future agent joins doctor for free.
 * @returns {Promise<{ ok: boolean, hard: boolean, label: string }[]>} */
async function integrationRows() {
  /** @type {{ ok: boolean, hard: boolean, label: string }[]} */
  const rows = [];
  for (const agent of AGENT_REGISTRY) {
    const status = agent.publicConfig();
    if (!status.enabled) continue;
    let verdict;
    try {
      verdict = /** @type {{ ok?: boolean, error?: string, caveat?: string }} */ (
        await agent.check({})
      );
    } catch (e) {
      verdict = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    rows.push({
      ok: verdict.ok === true,
      hard: false,
      label:
        verdict.ok === true
          ? `${agent.label} enabled and ready${verdict.caveat ? ` (⚠ ${verdict.caveat})` : ""}`
          : `${agent.label} enabled but NOT ready — ${verdict.error ?? verdict.caveat ?? "check failed"} (npm run ${agent.id}:check)`,
    });
  }
  return rows;
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
function hasGraphify() {
  try {
    execFileSync("graphify", ["--version"], { stdio: "ignore" });
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

// Learning scaffolds: heal-on-doctor — creates <plugin>/{skills,library}/ + kind indexes when
// absent (any domain), so XENOMOON_LIBRARY always resolves and promotions have a destination.
const scaffolded = ensureDomainLibrary(FRAMEWORK_PLUGIN_DIR);

/** @type {{ ok: boolean, hard: boolean, label: string }[]} */
const checks = [
  {
    ok: existsSync(path.join(FRAMEWORK_PLUGIN_DIR, ".claude-plugin", "plugin.json")),
    hard: true,
    label: "xenomoon plugin manifest present",
  },
  {
    ok: true,
    hard: false,
    label: scaffolded.length
      ? `learning scaffolds created (${scaffolded.length} files — skills/ + library/ kind indexes)`
      : "learning scaffolds present (skills/ + library/)",
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
    // Only a domain that materializes tools INTO the project (an engine that materializes its
    // verify tools into the project) has this to check; a domain that verifies via package scripts
    // (Node) materializes nothing, so it's N/A there. HARD only when the domain writes tools into the project.
    ok: DOMAIN.materializeIntoProject
      ? existsSync(path.join(PROJECT_DIR, "tools", "validate.sh"))
      : true,
    hard: DOMAIN.materializeIntoProject,
    label: DOMAIN.materializeIntoProject
      ? "tools/ materialized into the project (gitignored)"
      : `${DOMAIN.label} verifies via package scripts (no materialized tools/)`,
  },
  {
    ok: true,
    hard: false,
    label: `${ENGINE_LABEL} toolchain via package scripts`,
  },
  // The materialized-into-project artifacts (facts manifest, library + asset symlinks) only exist
  // for a domain that opts into writing files into the project tree (a binary-backed engine). Omit
  // the rows entirely for a domain that materializes nothing, rather than show them perpetually "—".
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
  {
    ok: hasGraphify(),
    hard: false,
    label:
      "graphify on PATH (optional — codebase knowledge-graph; install: uv tool install graphifyy)",
  },
  {
    ok: nodeOk(),
    hard: false,
    label: `node ${process.versions.node} (engines wants ${enginesNode()})${nodeOk() ? "" : " — upgrade node"}`,
  },
  {
    ok: ghAuthOk(),
    hard: false,
    label: ghAuthOk()
      ? "gh CLI authenticated"
      : "gh CLI not authenticated — run `gh auth login` (issue pipeline needs it)",
  },
  // Paid external agents — a soft probe per ENABLED integration (a disabled one is not a
  // problem; an enabled-but-broken one is the silent failure this catches). Fix hints come
  // from each probe's own error text.
  ...(await integrationRows()),
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
// Applicability, not just status: an approved entry whose source is gone or whose target is
// already core can NEVER apply — telling the user to "run promote" on those is a lie that
// erodes trust in the board. Split appliable from dead and say which is which.
const approvedEntries = approvedPending();
const appliable = approvedEntries.filter((p) => {
  const { src, dst } = locate(p.kind, p.name, PROJECT_DIR);
  return existsSync(src) && !existsSync(dst);
});
const dead = approvedEntries.length - appliable.length;
if (requested || approvedEntries.length) {
  console.log(
    `  ⇧ promotions: ${requested} awaiting a decision, ${appliable.length} approved+appliable` +
      (appliable.length ? " — run `npm run promote -- --pending` to apply" : "") +
      (dead
        ? `; ${dead} approved but UN-APPLIABLE (source gone or target already core) — ` +
          "reject them on the board with a reason, or re-route the content via /learn"
        : "") +
      ".",
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
