// forge new — install the framework for a project in one step: lock the project to a domain,
// scaffold a starter ONLY when the domain ships one and the folder is empty (otherwise wire an
// existing project in place — never scaffolding over your code), remember the path, materialize
// the domain's per-project files, then health-check.
//
// The framework's agents/skills are NOT copied into the project — they load from the domain's
// plugin: automatically in the web UI, and in terminal Claude Code after a one-time
// `/plugin install` (printed by doctor). The committed project stays pure.
//
// Usage:
//   npm run install-project -- ../mysite --domain=webapp (scaffold or wire the webapp domain in place)
//   npm run install-project -- ../myapp --domain=app     (install the `app` domain into an existing project)
//
// The chosen domain is written as a project-owned lock (.xenomoon-project.json), committed with
// the project so the binding travels and the framework can't later drive it as the wrong domain.
import {
  existsSync,
  mkdirSync,
  cpSync,
  readFileSync,
  appendFileSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import readline from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";
import {
  loadDomain,
  readProjectLock,
  writeProjectLock,
  resolveProjectTemplate,
  PROJECT_LOCK_FILE,
  availableDomains,
} from "../core/domain-resolver.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli
const FRAMEWORK_DIR = path.join(here, "..", "..", "..");

// Parse argv: a positional target path + an optional `--domain=<name>` / `--domain <name>`.
const argv = process.argv.slice(2);
let domainFlag = null;
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === undefined) continue;
  if (a.startsWith("--domain=")) domainFlag = a.slice("--domain=".length);
  else if (a === "--domain") domainFlag = argv[++i] ?? null;
  else if (!a.startsWith("--")) positional.push(a);
}

// ---- The terminal questionnaire ----------------------------------------------------------
// ALL the simple/binary install questions live HERE, up front, in one pass (TTY-only, and
// each asked ONLY when its value is missing — scripted/CI invocations that pass flags stay
// byte-identical): project folder → domain → port (empty = default) → hermes/codex/kimi.
// The AI half of onboarding happens in the FIRST UI SESSION: the server sees the
// `onboarded:false` flag (written below) and kicks off /onboard there — full tooling,
// no terminal plugin install needed.
const interactive = process.stdin.isTTY && process.stdout.isTTY;
const rl = interactive
  ? readline.createInterface({ input: process.stdin, output: process.stdout })
  : null;

let targetInput = positional[0] ?? null;
if (!targetInput && rl) {
  targetInput = (await rl.question("Project folder (absolute path): ")).trim() || null;
}
const target = path.resolve(targetInput ?? path.join(FRAMEWORK_DIR, "..", "game"));

// Determine the install domain: explicit flag wins; else an existing lock (re-install); else the
// default. A flag that contradicts an existing lock is refused — re-domaining is deliberate.
const existingLock = readProjectLock(target);
if (domainFlag && existingLock && domainFlag !== existingLock) {
  console.error(
    `new: ${target} is already installed for domain "${existingLock}"; refusing to re-domain to ` +
      `"${domainFlag}". Remove ${path.join(target, PROJECT_LOCK_FILE)} first to override.`,
  );
  process.exit(1);
}
let domainName = domainFlag ?? existingLock;
if (!domainName && rl) {
  const avail = availableDomains(FRAMEWORK_DIR);
  domainName =
    (
      await rl.question(`Domain for this project${avail.length ? ` (${avail.join(" | ")})` : ""}: `)
    ).trim() || null;
}
// Port — empty keeps the default. Saved into .xenomoon.json so `npm start` needs no env.
let portAnswer = null;
if (rl) {
  portAnswer = (await rl.question("UI port [empty = 3117]: ")).trim() || null;
  if (portAnswer && !/^\d+$/.test(portAnswer)) {
    console.error(`new: port must be a number (got "${portAnswer}").`);
    process.exit(1);
  }
}
if (!domainName) {
  const avail = availableDomains(FRAMEWORK_DIR);
  console.error(
    "new: no domain given. Pass --domain <name>" +
      (avail.length ? ` (available: ${avail.join(", ")})` : "") +
      `\n  e.g. npm run install-project -- ${positional[0] ?? "../myapp"} --domain app`,
  );
  process.exit(1);
}
const DOMAIN = loadDomain(domainName, FRAMEWORK_DIR);
// Propagate to the spawned child steps so they resolve the same domain (they also read the lock).
process.env.XENOMOON_DOMAIN = domainName;

/** Run a child step, inheriting stdio so its output streams through. @param {string[]} args */
const node = (...args) => execFileSync("node", args, { stdio: "inherit" });

/** Make sure the project ignores the framework's generated/working paths, so they're never
 * committed. `.xenomoon/` (the per-project task board / autonomous / skill-setup state the framework
 * writes for EVERY domain) is ALWAYS ignored — so temp tasks never land in the project's repo;
 * materialize domains add their working dirs too. The domain lock itself is intentionally NOT
 * ignored — it is committed with the project. @param {string} dir @param {boolean} materializes */
function ensureIgnores(dir, materializes) {
  const file = path.join(dir, ".gitignore");
  // Always ignored — every domain writes session/task/autonomous state into <project>/.xenomoon/.
  const need = [".xenomoon/", ".claude/projects/"];
  // Materialize domains also drop working files (tools/, library/, …) into the project tree.
  if (materializes) need.push("/tools/", "/library", "/x-shared-assets", "/transcripts/");
  let cur = "";
  try {
    cur = readFileSync(file, "utf8");
  } catch {
    /* no .gitignore yet */
  }
  const lines = cur.split(/\r?\n/);
  const missing = need.filter((p) => !lines.includes(p));
  if (!missing.length) return;
  const block =
    "\n# Xenomoon Forge generated/working files — not repo content\n" + missing.join("\n") + "\n";
  if (cur) appendFileSync(file, block);
  else writeFileSync(file, block.trimStart());
  console.log(`new: added ${missing.length} ignore rule(s) to ${file}`);
}

// 0. Ensure the target exists. How the binding is remembered depends on the domain:
//    - materialize domains (the kind a binary-backed engine needs; a deferred seam) write a
//      project-owned lock, committed so it travels with the project (the
//      child steps also resolve it via the XENOMOON_DOMAIN env set above).
//    - every other domain stays OUT of the project entirely — the binding lives in the framework's
//      own .xenomoon.json (domain persisted in step 2b), so the project is never touched.
mkdirSync(target, { recursive: true });
if (DOMAIN.materializeIntoProject) {
  writeProjectLock(target, domainName);
  console.log(`new: locked ${target} to domain "${domainName}" (${PROJECT_LOCK_FILE}).`);
} else {
  console.log(
    `new: domain "${domainName}" writes nothing into ${target} — bound via the framework's .xenomoon.json.`,
  );
}

// 1. Scaffold the domain's starter into an empty/new target — ONLY if the domain ships one. An
//    existing project (marker present) or a starterless domain is wired in place, never overwritten.
const marker = path.join(target, DOMAIN.engine.projectFile);
if (existsSync(marker)) {
  console.log(`new: ${target} already has a ${DOMAIN.engine.projectFile} — wiring it in place.`);
} else if (DOMAIN.starter) {
  cpSync(path.join(FRAMEWORK_DIR, DOMAIN.starter), target, { recursive: true });
  console.log(`new: scaffolded ${DOMAIN.label} starter → ${target}`);
} else {
  console.log(
    `new: ${target} has no ${DOMAIN.engine.projectFile} and the ${DOMAIN.label} domain ships no ` +
      `starter — installing into it as-is (bring your own project).`,
  );
}
// Always — every domain writes <project>/.xenomoon/ state, so it must be gitignored even for a
// non-materialize (install-in-place) domain like webapp.
ensureIgnores(target, DOMAIN.materializeIntoProject);

// 1b. Seed a CLAUDE.md "project facts" template the orchestrator + agents treat as authoritative —
//     the active domain's own template if the pack ships one, else the CORE neutral baseline. Written
//     ONLY when the project has none: an existing CLAUDE.md (yours, or one a starter shipped) is never
//     overwritten. This is the project's OWN committed doc (project facts, in your voice), not framework
//     working-state — so unlike .xenomoon/ it is intentionally NOT gitignored.
const claudeMd = path.join(target, "CLAUDE.md");
const templatePath = resolveProjectTemplate(domainName, FRAMEWORK_DIR);
if (existsSync(claudeMd)) {
  console.log(`new: ${target} already has a CLAUDE.md — leaving it untouched.`);
} else if (templatePath) {
  let projectName = path.basename(target);
  try {
    const pkg = /** @type {{ name?: unknown }} */ (
      parseJSON(readFileSync(path.join(target, "package.json"), "utf8"))
    );
    if (typeof pkg.name === "string" && pkg.name) projectName = pkg.name;
  } catch {
    /* no/invalid package.json — keep the folder name */
  }
  const tpl = readFileSync(templatePath, "utf8").replaceAll("{{PROJECT_NAME}}", projectName);
  writeFileSync(claudeMd, tpl);
  console.log(
    `new: seeded CLAUDE.md project-facts template (fill in the {{…}} placeholders) → ${claudeMd}`,
  );
}

// 2. Remember the path (writes .xenomoon.json projectDir).
node(path.join(here, "setup.js"), target);

// 2b. A non-materialize domain writes no project lock, so the framework must remember the domain
//     itself — persist it into .xenomoon.json beside the path (materialize domains rely on the
//     committed project lock instead).
if (!DOMAIN.materializeIntoProject) {
  const cfgFile = path.join(FRAMEWORK_DIR, ".xenomoon.json");
  /** @type {Record<string, unknown>} */
  let cfg = {};
  try {
    cfg = /** @type {Record<string, unknown>} */ (parseJSON(readFileSync(cfgFile, "utf8")));
  } catch {
    /* absent/invalid — start fresh */
  }
  writeFileSync(
    cfgFile,
    JSON.stringify(
      { ...cfg, domain: domainName, ...(portAnswer ? { port: Number(portAnswer) } : {}) },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `new: bound domain "${domainName}"${portAnswer ? ` on port ${portAnswer}` : ""} in ${cfgFile}.`,
  );
}

// 3. Materialize the domain's per-project files: tools/ copied, library/ symlinked (if any).
node(path.join(here, "materialize.js"), target);

// 4. Health check — fails loudly if anything didn't land.
node(path.join(here, "doctor.js"), target);

// 5. Integrations — the remaining binary questions, same single pass (each answers y → the
//    existing setup script runs; anything else skips cleanly; the portal can enable them later).
if (rl) {
  for (const [id, blurb] of [
    ["hermes", "external researcher (Nous billing)"],
    ["codex", "adversarial code reviewer (OpenAI/ChatGPT billing)"],
    ["kimi", "external coder over ACP (Moonshot billing)"],
  ]) {
    const a = (await rl.question(`Configure ${id} — ${blurb}? [y/N] `)).trim().toLowerCase();
    if (a === "y" || a === "yes") {
      try {
        execFileSync("npm", ["run", `${id}:setup`], { stdio: "inherit" });
      } catch {
        console.warn(`new: ${id}:setup failed — enable it later via ⚙ Settings.`);
      }
    }
  }
}

// 6. First-boot flag: the SERVER kicks off /onboard in the first UI session (the session
//    has the plugin loaded, so the command exists with full tooling — forms + board). Only
//    set on a fresh install; a re-install of an already-onboarded project keeps its flag.
{
  const cfgFile = path.join(FRAMEWORK_DIR, ".xenomoon.json");
  /** @type {Record<string, unknown>} */
  let cfg = {};
  try {
    cfg = /** @type {Record<string, unknown>} */ (parseJSON(readFileSync(cfgFile, "utf8")));
  } catch {
    /* absent — fresh */
  }
  if (cfg.onboarded === undefined) {
    writeFileSync(cfgFile, JSON.stringify({ ...cfg, onboarded: false }, null, 2) + "\n");
  }
}
rl?.close();

console.log(
  `\nnew: done (domain "${domainName}"). Start the server:\n    xenomoon start      # web UI on port ${portAnswer ?? "3117"} — the FIRST session runs the /onboard interview, then the UI asks the rest.`,
);
