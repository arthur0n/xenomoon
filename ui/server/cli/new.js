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
  readdirSync,
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
  resolvePackDir,
  PROJECT_LOCK_FILE,
  availableDomains,
} from "../core/domain-resolver.js";
import { installCapabilities } from "./install-capabilities.js";
import { deploysOnPush, order, promptOpts } from "./branch-model.js";
import { pickList } from "./picklist.js";
import { detect as detectDomain, order as orderDomains, summarize } from "./domain-pick.js";
import { DEFAULT_PORT, savedPort, otherInstallPorts, firstFreePort } from "./port-pick.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli
const FRAMEWORK_DIR = path.join(here, "..", "..", "..");

// Parse argv: a positional target path + optional `--domain=<name>` and `--port=<n>` (both
// also accepted space-separated).
//
// `--port` exists because a SCRIPTED install had no way to state one: the question is
// TTY-only, so a non-interactive run wrote no port and the install silently fell back to the
// global default. Rebuilding an install that way moves it off the port it had been using onto
// one another install may already hold — which is exactly how two installs ended up both
// answering on 3117.
const argv = process.argv.slice(2);
let domainFlag = null;
let portFlag = null;
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === undefined) continue;
  if (a.startsWith("--domain=")) domainFlag = a.slice("--domain=".length);
  else if (a === "--domain") domainFlag = argv[++i] ?? null;
  else if (a.startsWith("--port=")) portFlag = a.slice("--port=".length);
  else if (a === "--port") portFlag = argv[++i] ?? null;
  else if (!a.startsWith("--")) positional.push(a);
}
if (portFlag !== null && !/^\d+$/.test(portFlag)) {
  console.error(`new: --port must be a number (got "${portFlag}").`);
  process.exit(1);
}

// ---- The terminal questionnaire ----------------------------------------------------------
// ALL the simple/binary install questions live HERE, up front, in one pass (TTY-only, and
// each asked ONLY when its value is missing — scripted/CI invocations that pass flags stay
// byte-identical): project folder → domain → port (empty = default) → hermes/codex/kimi.
// The AI half of onboarding happens in the FIRST UI SESSION: the server sees the
// `onboarded:false` flag (written below) and kicks off onboarding there — full tooling,
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

/** The project's own default branch — what "lands on main" actually means here.
 * @param {string} dir @returns {string} */
function projectDefaultBranch(dir) {
  for (const args of [
    ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    ["rev-parse", "--abbrev-ref", "HEAD"],
  ]) {
    try {
      const out = execFileSync("git", ["-C", dir, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (out) return out.replace(/^origin\//, "");
    } catch {
      /* not a repo, or no origin — try the next form */
    }
  }
  return "main";
}

/** A pack's RAW descriptor. `loadDomain` normalises into the runtime shape and drops
 * `description`, which is the one field a picklist row wants.
 * @param {string} name @returns {{ label?: string, description?: string }} */
function packDescriptor(name) {
  try {
    const dir = resolvePackDir(name, FRAMEWORK_DIR);
    return /** @type {{ label?: string, description?: string }} */ (
      parseJSON(readFileSync(path.join(FRAMEWORK_DIR, "domains", dir, "domain.json"), "utf8"))
    );
  } catch {
    return { label: loadDomain(name, FRAMEWORK_DIR).label };
  }
}

/** The project's own package.json — {} when it has none or it is unreadable.
 * @param {string} dir @returns {{ dependencies?: Record<string, string>,
 *   devDependencies?: Record<string, string> }} */
function projectPkg(dir) {
  try {
    return /** @type {{ dependencies?: Record<string, string> }} */ (
      parseJSON(readFileSync(path.join(dir, "package.json"), "utf8"))
    );
  } catch {
    return {};
  }
}

/** Names in the project root — empty when it cannot be read.
 * @param {string} dir @returns {string[]} */
function projectFiles(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** The project's workflow files, as {name, text} — empty when it has none.
 * @param {string} dir @returns {{ name: string, text: string }[]} */
function projectWorkflows(dir) {
  const wfDir = path.join(dir, ".github", "workflows");
  try {
    return readdirSync(wfDir)
      .filter((f) => /\.ya?ml$/.test(f))
      .map((name) => ({ name, text: readFileSync(path.join(wfDir, name), "utf8") }));
  } catch {
    return [];
  }
}

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
// Domain — asked as a picklist ordered by what the PROJECT declares. An Expo app names `expo`
// in its manifest; a web app does not. Detection only decides the ORDER and is always shown
// with its evidence — a recommendation you can check beats a default you cannot.
if (!domainName && rl) {
  const avail = availableDomains(FRAMEWORK_DIR);
  const detected = detectDomain(projectPkg(target), projectFiles(target));
  const domainItems = orderDomains(
    avail.map((name) => ({ id: name, summary: summarize(packDescriptor(name)) })),
    detected,
  );
  const picked = await pickList(rl, {
    title: "Domain for this project — the capability pack installed into `plugin/`.",
    items: domainItems,
    note: detected
      ? [`Detected ${detected.id} from ${detected.why}.`]
      : ["Nothing in the project decided it — pick the one that matches your stack."],
    label: "Domain",
  });
  domainName = picked.id;
  if (!domainName) {
    console.error(
      `new: pick 1-${domainItems.length} or a name (${domainItems.map((d) => d.id).join(", ")}) — got "${picked.answer.trim()}".`,
    );
    process.exit(1);
  }
}
// Port — an install OWNS one, and it is saved into .xenomoon.json so `npm start` needs no env.
//
// An unanswered port used to write nothing and fall through to the global default, so two
// installs on one machine both answered on it and whichever server started first served the
// other's UI. So: `--port` wins, then the port this install already had (a re-install keeps
// what it was using), then the first port no OTHER registered install claims — and it is
// ALWAYS written. The suggestion is announced with its reason, never applied silently.
const takenPorts = otherInstallPorts(FRAMEWORK_DIR);
const currentPort = savedPort(FRAMEWORK_DIR);
const suggestedPort = currentPort ?? firstFreePort(DEFAULT_PORT, takenPorts);
let portAnswer = portFlag;
if (!portAnswer && rl) {
  if (suggestedPort !== DEFAULT_PORT)
    console.log(
      currentPort
        ? `  This install already uses port ${currentPort} — keeping it unless you say otherwise.`
        : `  Port ${DEFAULT_PORT} is taken by another install on this machine; suggesting ${suggestedPort}.`,
    );
  portAnswer = (await rl.question(`UI port [empty = ${suggestedPort}]: `)).trim() || null;
  if (portAnswer && !/^\d+$/.test(portAnswer)) {
    console.error(`new: port must be a number (got "${portAnswer}").`);
    process.exit(1);
  }
}
portAnswer ??= String(suggestedPort);
// Branch model — the project's branch & merge convention, decided by the human here and
// re-confirmable during onboarding. Written to <project>/.xenomoon/branch-model (the runtime
// source every session reads); the .xenomoon.json copy is provenance only. The options and
// their ordering live in ./branch-model.js — asked as a picklist, ordered by what the PROJECT
// does, because "land directly on main" is the wrong default on a repo that deploys from it.
const defaultBranch = projectDefaultBranch(target);
const deployWorkflows = deploysOnPush(projectWorkflows(target), defaultBranch);
const branchModels = order(deployWorkflows.length > 0);
let branchModel = null;
if (rl) {
  const picked = await pickList(rl, {
    ...promptOpts({ models: branchModels, branch: defaultBranch, deployWorkflows }),
    label: "Branch model",
  });
  branchModel = picked.id;
  if (!branchModel) {
    console.error(
      `new: pick 1-${branchModels.length} or a name (${branchModels.map((m) => m.id).join(", ")}) — got "${picked.answer.trim()}".`,
    );
    process.exit(1);
  }
}
branchModel ??= branchModels[0]?.id ?? "trunk";
// Non-interactive installs get the same evidence-based pick — but never silently, since nobody
// saw the question. Announcing it is what makes it correctable.
if (!rl)
  console.log(
    `new: branch model "${branchModel}"` +
      (deployWorkflows.length > 0
        ? ` — ${deployWorkflows.join(", ")} deploy on push to \`${defaultBranch}\`.`
        : ` — nothing deploys from \`${defaultBranch}\`.`),
  );
// Paid commands — the project's OWN spend surface, which no framework can know. The well-known
// model endpoints are always gated (DEFAULT_SPEND_RE); what a project's `pnpm eval` or image-gen
// script costs is a fact only its human has, and 2026-07-14 proved what an unasked one costs (a
// prepay balance drained in one session). Asked here because setup is the one moment guaranteed
// to happen per project; onboarding re-confirms it on projects with an existing Claude life.
// Fresh installs only — an existing policy block is the human's, edited by hand, never re-asked.
/** @type {string[]} */
let spendPatterns = [];
const hasPolicyBlock = (() => {
  try {
    const cfg = /** @type {{ policy?: unknown }} */ (
      parseJSON(readFileSync(path.join(FRAMEWORK_DIR, ".xenomoon.json"), "utf8"))
    );
    return cfg.policy !== undefined;
  } catch {
    return false;
  }
})();
if (rl && !hasPolicyBlock) {
  const spendAnswer = (
    await rl.question(
      "Paid commands — scripts in this project that SPEND real API credits (image gen, evals,\n" +
        "batch LLM calls). Each match gates behind one approval prompt; well-known model\n" +
        "endpoints are always gated regardless.\n" +
        "Comma-separated substrings [empty = none]: ",
    )
  ).trim();
  spendPatterns = [
    ...new Set(
      spendAnswer
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
    ),
  ];
  if (spendPatterns.length > 0)
    console.log(`  gating ${spendPatterns.length} pattern(s): ${spendPatterns.join(" · ")}`);
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
// CANONICALIZE ONCE, here. `--domain <old-name>` still resolves (the pack claims it via
// `formerNames`), but everything persisted or looked up afterwards must use the pack's CURRENT
// name: the project lock, the framework binding, the env for child steps, and the template lookup
// (`resolveProjectTemplate` reads domains/<name>/templates, so an old name would silently skip the
// pack's CLAUDE.md seed). Installing under an alias must not leave a clone bound to a name the
// pack no longer has.
domainName = resolvePackDir(domainName, FRAMEWORK_DIR);
// Propagate to the spawned child steps so they resolve the same domain (they also read the lock).
process.env.XENOMOON_DOMAIN = domainName;

// The PICKER's core act: install this domain's capabilities into the framework's single `plugin/`
// tree and bake its runtime descriptor into .xenomoon.json. After this the framework is one tree and
// there is no "domain" at runtime — nothing under domains/ is read once the server is running.
{
  const { copied } = installCapabilities(FRAMEWORK_DIR, domainName);
  console.log(`new: installed "${domainName}" capabilities into plugin/ (${copied.join(", ")}).`);
}

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

// 1c. Seed the project library stubs the CLAUDE.md index points at (CLAUDE.md is an INDEX;
//     full durable content lives here). Only ever created, never overwritten.
const projectLibrary = path.join(target, ".claude", "library");
const LIBRARY_STUBS = {
  "business-rules.md":
    "# Business rules / product facts\n\n" +
    "Standing facts about what this product does / doesn't do — captured product INTENT,\n" +
    "in the user's own words, verbatim. Product-owner-maintained, human-gated. The agents treat\n" +
    "this doc as AUTHORITATIVE intent. Empty until the first design seeds it.\n",
  "project.md":
    "# Project details\n\n" +
    "Extended project details too long for a CLAUDE.md one-liner — infra notes, service\n" +
    "map, environment quirks. Keep CLAUDE.md as the index; put the content here.\n",
};
for (const [stub, content] of Object.entries(LIBRARY_STUBS)) {
  const p = path.join(projectLibrary, stub);
  if (existsSync(p)) continue;
  mkdirSync(projectLibrary, { recursive: true });
  writeFileSync(p, content);
  console.log(`new: seeded project library stub → ${p}`);
}

// 1d. Bake the branch model project-side — the runtime source of truth every session and
//     capability reads. Never overwritten on re-install: an existing file IS the human's
//     current choice (edit it, or re-run onboarding, to change the model as the project matures).
{
  const modelFile = path.join(target, ".xenomoon", "branch-model");
  if (existsSync(modelFile)) {
    console.log(`new: ${modelFile} already set — keeping the existing branch model.`);
  } else {
    mkdirSync(path.dirname(modelFile), { recursive: true });
    writeFileSync(modelFile, branchModel + "\n");
    console.log(`new: branch model "${branchModel}" → ${modelFile}`);
  }
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
      {
        ...cfg,
        domain: domainName,
        branchModel,
        // ALWAYS written. An absent port is not "the default" — it is two installs silently
        // resolving to the same one, and the server that starts first serving the other's UI.
        port: Number(portAnswer),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`new: bound domain "${domainName}" on port ${portAnswer} in ${cfgFile}.`);
}

// 3. Materialize the domain's per-project files: tools/ copied, library/ symlinked (if any).
node(path.join(here, "materialize.js"), target);

// 4. Health check — fails loudly if anything didn't land.
node(path.join(here, "doctor.js"), target);

// 5. Integrations — the remaining binary questions, same single pass (each answers y → the
//    existing setup script runs; anything else skips cleanly; the portal can enable them later).
if (rl) {
  for (const [id, blurb] of [
    [
      "hermes",
      "external researcher (Nous billing; real web search ALSO needs a search backend — a free Firecrawl key or the free ddgs package; setup walks you through it)",
    ],
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

// 6. First-boot flag: the SERVER kicks off onboarding in the first UI session (the session
//    has the plugin loaded, so the command exists with full tooling — forms + board). Only
//    set on a fresh install; a re-install of an already-onboarded project keeps its flag.
//    The consequential-action policy block is seeded here too, create-only: the knobs exist
//    whether or not this writes them (config.js defaults every absent key to "ask"), but an
//    invisible knob is an undiscoverable one — the 2026-08 live test parked for days on gates
//    whose `allow` opt-in nothing had ever surfaced. Only the literal "allow" allows; `ask`
//    prompts a human, and an AUTONOMOUS run cannot answer a prompt, so a goal that orders a
//    deploy-reaching push/merge (or an unattended Codex review) needs its key set to "allow".
{
  const cfgFile = path.join(FRAMEWORK_DIR, ".xenomoon.json");
  /** @type {Record<string, unknown>} */
  let cfg = {};
  try {
    cfg = /** @type {Record<string, unknown>} */ (parseJSON(readFileSync(cfgFile, "utf8")));
  } catch {
    /* absent — fresh */
  }
  /** @type {Record<string, unknown>} */
  const next = { ...cfg };
  if (next.onboarded === undefined) next.onboarded = false;
  if (next.policy === undefined)
    next.policy = {
      push: "ask",
      merge: "ask",
      dependencies: "ask",
      branchCreate: "ask",
      spend: "ask",
      spendPatterns,
      codexReview: "ask",
    };
  if (next.onboarded !== cfg.onboarded || next.policy !== cfg.policy) {
    writeFileSync(cfgFile, JSON.stringify(next, null, 2) + "\n");
  }
}
rl?.close();

console.log(
  `\nnew: done (domain "${domainName}"). Start the server:\n    xenomoon up         # web UI on port ${portAnswer}, DETACHED (terminal stays free; xenomoon stop / restart)\n    xenomoon start      # same server in the foreground, logs in this terminal\nThe FIRST session runs the onboarding interview, then the UI asks the rest.`,
);
