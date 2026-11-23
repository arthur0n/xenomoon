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
import { readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import readline from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDomain,
  readProjectLock,
  resolvePackDir,
  PROJECT_LOCK_FILE,
  availableDomains,
} from "../core/domain-resolver.js";
import { installCapabilities } from "./install-capabilities.js";
import { deploysOnPush, order, promptOpts, workspaceBranchFacts } from "./branch-model.js";
import { loadWorkspace } from "../../lib/workspace.js";
import { hasProjectSetting } from "../../lib/project-settings.js";
import { prepareProject, seedProjectSettings } from "./prepare-project.js";
import { pickList } from "./picklist.js";
import { domainPickItems } from "./domain-pick-rows.js";
import {
  DEFAULT_PORT,
  savedPort,
  allocationRefusal,
  otherInstallPorts,
  firstFreePort,
  suggestProjectPort,
} from "./port-pick.js";
import { validateProjectPath, canonicalPath } from "./validate-path.js";
import { readProfiles } from "./profiles.js";
import {
  installedDomain,
  domainRefusal,
  entryForDir,
  nameRefusal,
  portRefusal,
  portsClaimedByOthers,
  readInstallConfig,
  mergeInstallConfig,
  addProjectEntry,
} from "./project-entry.js";

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
/** @type {string | null} the project's name in the install's `projects` map (#65) */
let nameFlag = null;
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === undefined) continue;
  if (a.startsWith("--domain=")) domainFlag = a.slice("--domain=".length);
  else if (a === "--domain") domainFlag = argv[++i] ?? null;
  else if (a.startsWith("--port=")) portFlag = a.slice("--port=".length);
  else if (a === "--port") portFlag = argv[++i] ?? null;
  else if (a.startsWith("--name=")) nameFlag = a.slice("--name=".length);
  else if (a === "--name") nameFlag = argv[++i] ?? null;
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
// project's `onboarded:false` flag (written below, in <project>/.xenomoon/settings.json) and kicks off onboarding there — full tooling,
// no terminal plugin install needed.
const interactive = process.stdin.isTTY && process.stdout.isTTY;
const rl = interactive
  ? readline.createInterface({ input: process.stdin, output: process.stdout })
  : null;

let targetInput = positional[0] ?? null;
if (!targetInput && rl) {
  targetInput = (await rl.question("Project folder (absolute path): ")).trim() || null;
}
// The project's REAL location (./validate-path.js canonicalPath): every check and every write
// below — the projects map included — sees one spelling per folder, whatever alias was typed.
const target = canonicalPath(targetInput ?? path.join(FRAMEWORK_DIR, "..", "game"));

/** Print a refusal and exit 1 — every refusal happens BEFORE the first write, except the
 * commit-time ownership re-check of step 2c, which happens before the install file's map write.
 * @param {string} msg @returns {never} */
function refuse(msg) {
  console.error(`new: ${msg}`);
  rl?.close();
  process.exit(1);
}

// ---- First project or a later one (#65) ----------------------------------------------------
// One install per domain; a project is an entry of the `projects` map in .xenomoon.json. An
// install whose domain is already installed (./project-entry.js installedDomain) only ADDS the
// project: no pack copy, no re-bake, no install-level questions or root writes.
const installCfg = readInstallConfig(FRAMEWORK_DIR);
const installed = installedDomain(installCfg);
const parsedMap = readProfiles(FRAMEWORK_DIR);
if (!parsedMap.ok) refuse(`${path.join(FRAMEWORK_DIR, ".xenomoon.json")}: ${parsedMap.reason}`);
const projectsMap = parsedMap.projects;
const listed = entryForDir(projectsMap, target, FRAMEWORK_DIR);
if (installed) {
  // Compared under the pack's CURRENT name, so an old alias of the installed pack still passes.
  const requested = (() => {
    try {
      return domainFlag ? resolvePackDir(domainFlag, FRAMEWORK_DIR) : null;
    } catch {
      return domainFlag;
    }
  })();
  const why = domainRefusal(installed, requested);
  if (why) refuse(why);
  domainFlag = installed;
}
// The project path is validated here for every run, first or later, before the first write:
// hard rows refuse, soft rows warn (--allow-nonlocal downgrades locality).
const pathProblems = validateProjectPath(target, path.resolve(FRAMEWORK_DIR), {
  allowNonlocal: argv.includes("--allow-nonlocal"),
});
for (const p of pathProblems.filter((p) => !p.hard)) console.warn(`⚠ ${p.msg}`);
const hardPathProblems = pathProblems.filter((p) => p.hard).map((p) => p.msg);
if (hardPathProblems.length) refuse(hardPathProblems.join("; "));
if (installed)
  console.log(`new: "${installed}" is already installed here — adding ${target} as a project.`);
// Project name — the folder name unless `--name` says otherwise; asked when interactive.
let projectName = listed?.name ?? nameFlag ?? path.basename(target);
if (listed) {
  if ((nameFlag && nameFlag !== listed.name) || portFlag)
    console.log(
      `new: ${target} is already the project "${listed.name}" — its entry is kept as it is` +
        ` (--name/--port are ignored for a listed project).`,
    );
} else {
  if (!nameFlag && rl)
    projectName =
      (await rl.question(`Project name [empty = ${projectName}]: `)).trim() || projectName;
  const why = nameRefusal(projectsMap, projectName, target, FRAMEWORK_DIR);
  if (why) refuse(why);
}

/** The project's own default branch — what "lands on main" actually means here — or null when
 * `dir` is not a readable repo (the caller decides, and says so).
 * @param {string} dir @returns {string | null} */
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
  return null;
}

/** Default branch + deploy-on-push workflows of the install target. A multi-repo workspace
 * parent (ui/lib/workspace.js) is not a repo: its facts come from the children, and every guess
 * is printed (probe #35 item 6) — a non-repo target no longer falls back to "main" silently.
 * @param {string} dir @returns {{ branch: string, deployWorkflows: string[] }} */
function branchFacts(dir) {
  let ws;
  try {
    ws = loadWorkspace(dir);
  } catch (e) {
    console.error(`new: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  if (!ws) {
    const own = projectDefaultBranch(dir);
    if (!own)
      console.warn(`new: ${dir} is not a readable git repo — assuming default branch "main".`);
    const branch = own ?? "main";
    return { branch, deployWorkflows: deploysOnPush(projectWorkflows(dir), branch) };
  }
  const facts = workspaceBranchFacts(
    ws.repos.map((r) => ({
      name: r.name,
      branch: projectDefaultBranch(r.dir),
      workflows: projectWorkflows(r.dir),
    })),
  );
  console.log(`  Workspace parent: ${ws.repos.length} repos (${ws.file}).`);
  for (const w of facts.warnings) console.warn(`new: workspace — ${w}`);
  return { branch: facts.branch, deployWorkflows: facts.deployWorkflows };
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
  const { items: domainItems, detected } = domainPickItems(
    FRAMEWORK_DIR,
    target,
    availableDomains(FRAMEWORK_DIR),
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
//
// A LATER project gets its own port instead: the first one no install or project claims
// (suggestProjectPort), and a port another one claims is refused. A listed project keeps its own.
const currentPort = savedPort(FRAMEWORK_DIR);
// The root project of an install made before the `projects` map existed keeps the root port.
const rootProject =
  !listed &&
  typeof installCfg.projectDir === "string" &&
  canonicalPath(installCfg.projectDir, FRAMEWORK_DIR) === target;
const ownPort = rootProject ? currentPort : null;
// A new port is never guessed: while a registered install's project list cannot be read, the
// ports its projects own are unknown, so refuse here, before any write. A project already in
// the map keeps its port and needs no pick.
if (!(listed && installed)) {
  const blocked = allocationRefusal(FRAMEWORK_DIR);
  if (blocked) refuse(blocked);
}
const suggestedPort = installed
  ? (listed?.entry.port ?? ownPort ?? suggestProjectPort(FRAMEWORK_DIR))
  : (currentPort ?? firstFreePort(DEFAULT_PORT, otherInstallPorts(FRAMEWORK_DIR)));
let portAnswer = listed && installed ? null : portFlag;
if (!portAnswer && rl && !(listed && installed)) {
  if (!installed && suggestedPort !== DEFAULT_PORT)
    console.log(
      currentPort
        ? `  This install already uses port ${currentPort} — keeping it unless you say otherwise.`
        : `  Port ${DEFAULT_PORT} is taken by another install on this machine; suggesting ${suggestedPort}.`,
    );
  portAnswer = (await rl.question(`UI port [empty = ${suggestedPort}]: `)).trim() || null;
  if (portAnswer && !/^\d+$/.test(portAnswer))
    refuse(`port must be a number (got "${portAnswer}").`);
}
portAnswer ??= String(suggestedPort);
// One port rule for first and later runs, before any write: a positive integer no other install
// or project claims. Only the project's own entry (a re-run) and, on a first run or for a pre-map
// root project, the install's root port are its own. Re-checked at commit (addProjectEntry).
const includeRoot = Boolean(installed) && !rootProject;
if (!(listed && installed)) {
  const claimed = portsClaimedByOthers(FRAMEWORK_DIR, installCfg, {
    ownName: listed?.name ?? projectName,
    includeRoot,
  });
  const why = portRefusal(Number(portAnswer), claimed);
  if (why) refuse(why);
}
// Branch model — the project's branch & merge convention, decided by the human here and
// re-confirmable during onboarding. Written to <project>/.xenomoon/branch-model (the runtime
// source every session reads); the install's .xenomoon.json gets no copy (#84). The options and
// their ordering live in ./branch-model.js — asked as a picklist, ordered by what the PROJECT
// does, because "land directly on main" is the wrong default on a repo that deploys from it.
const { branch: defaultBranch, deployWorkflows } = branchFacts(target);
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
// Fresh projects only — an existing policy block in the PROJECT's .xenomoon/settings.json is the
// human's, edited by hand, never re-asked (#84: the install's .xenomoon.json no longer counts).
/** @type {string[]} */
let spendPatterns = [];
const hasPolicyBlock = hasProjectSetting(target, "policy");
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
// A later project skips it: the domain is installed once per install (#65).
if (!installed) {
  const { copied } = installCapabilities(FRAMEWORK_DIR, domainName);
  console.log(`new: installed "${domainName}" capabilities into plugin/ (${copied.join(", ")}).`);
}

/** Run a child step, inheriting stdio so its output streams through. @param {string[]} args */
const node = (...args) => execFileSync("node", args, { stdio: "inherit" });

// 0-1d. Prepare the project: target + lock, starter, ignores, CLAUDE.md, library stubs, branch
//      model (./prepare-project.js).
prepareProject({ target, domainName, DOMAIN, branchModel, frameworkDir: FRAMEWORK_DIR });

// 2. There is no "project of the install" (#65): no root projectDir is written. The project is
//    remembered in step 2c (the `projects` map) and the install registers itself in doctor (step 4).

// 2b. A non-materialize domain writes no project lock, so the framework must remember the domain
//     itself — persist it into .xenomoon.json beside the path (materialize domains rely on the
//     committed project lock instead). First project only, like step 2.
//     The root port is ALWAYS written: an absent port is not "the default" — it is two installs
//     silently resolving to the same one, and the server that starts first serving the other's UI.
const rootPatch =
  !installed && !DOMAIN.materializeIntoProject
    ? { domain: domainName, port: Number(portAnswer) }
    : null;
if (rootPatch && listed) {
  const why = mergeInstallConfig(FRAMEWORK_DIR, rootPatch);
  if (why) refuse(why);
}

// 2c. The project's entry in the install's `projects` map (#65) — the first project under the
//     install's port, a later one under its own, written together with 2b's root fields. A listed
//     folder keeps its entry untouched. The write re-checks name and port against the file as
//     it is now, so a run that took either meanwhile makes this one write nothing and exit 1.
if (!listed) {
  const why = addProjectEntry(
    FRAMEWORK_DIR,
    projectName,
    { dir: target, port: Number(portAnswer) },
    { includeRoot, patch: rootPatch ?? {} },
  );
  if (why) refuse(why);
  console.log(`new: project "${projectName}" → ${target} on port ${portAnswer} (projects map).`);
}
if (rootPatch) {
  const cfgFile = path.join(FRAMEWORK_DIR, ".xenomoon.json");
  console.log(`new: bound domain "${domainName}" on port ${portAnswer} in ${cfgFile}.`);
}

// 3. Materialize the domain's per-project files: tools/ copied, library/ symlinked (if any).
node(path.join(here, "materialize.js"), target);

// 4. Health check — fails loudly if anything didn't land.
node(path.join(here, "doctor.js"), target);

// 5. Integrations — the remaining binary questions, same single pass (each answers y → the
//    existing setup script runs; anything else skips cleanly; the portal can enable them later).
//    Install-level, so a later project skips them.
if (rl && !installed) {
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
        // The project is passed explicitly: config.js would otherwise fall back to ../project.
        execFileSync("npm", ["run", `${id}:setup`, "--", target], { stdio: "inherit" });
      } catch {
        console.warn(`new: ${id}:setup failed — enable it later via ⚙ Settings.`);
      }
    }
  }
}

// 6. First-boot flag + consequential-action policy block, create-only (./prepare-project.js).
seedProjectSettings({ target, hasPolicyBlock, spendPatterns });
rl?.close();

// The hub is the only entry point (plugin/library/verdicts/hub-is-the-only-entry-point.md).
console.log(
  `\nnew: done (project "${projectName}", domain "${domainName}", port ${portAnswer}). Start it through the hub:\n    cd ${FRAMEWORK_DIR} && npm run hub   # the hub opens every project of this install\nThe FIRST session runs the onboarding interview, then the UI asks the rest.`,
);
