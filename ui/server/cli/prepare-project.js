// Per-project preparation for `forge new` (ui/server/cli/new.js), moved out of new.js unchanged
// (#65): `npm run install-project` (new.js) prepares every project added to an install through
// it. Two entry points, called by
// new.js at the same two points the code ran before, so the order of effects relative to
// setup.js, materialize, doctor and the integration prompts is unchanged:
//   - prepareProject       — steps 0 to 1d (target + lock, starter, ignores, CLAUDE.md, library
//                            stubs, branch model), before setup.js;
//   - seedProjectSettings  — step 6 (first-boot flag + policy block), after the integrations.
// No readline, no questionnaire, no process.exit here: new.js keeps every decision and exit.
import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../lib/json.js";
import {
  writeProjectLock,
  resolveProjectTemplate,
  PROJECT_LOCK_FILE,
} from "../core/domain-resolver.js";
import { ensureIgnores } from "../core/project-side.js";
import { hasProjectSetting, writeProjectSettings } from "../../lib/project-settings.js";

/**
 * Steps 0 to 1d of `forge new` for one project.
 * @param {{
 *   target: string,
 *   domainName: string,
 *   DOMAIN: import("../core/domain-resolver.js").DomainDescriptor,
 *   branchModel: string,
 *   frameworkDir: string,
 * }} opts
 * @returns {void}
 */
export function prepareProject({ target, domainName, DOMAIN, branchModel, frameworkDir }) {
  // 0. Ensure the target exists. How the binding is remembered depends on the domain:
  //    - materialize domains (the kind a binary-backed engine needs; a deferred seam) write a
  //      project-owned lock, committed so it travels with the project (the
  //      child steps also resolve it via the XENOMOON_DOMAIN env new.js sets before this call).
  //    - every other domain stays OUT of the project entirely — the binding lives in the framework's
  //      own .xenomoon.json (domain persisted in step 2b), so the project is never touched.
  mkdirSync(target, { recursive: true });
  if (DOMAIN.materializeIntoProject) {
    writeProjectLock(target, domainName);
    console.log(`new: locked ${target} to domain "${domainName}" (${PROJECT_LOCK_FILE}).`);
  } else {
    console.log(
      `new: domain "${domainName}" writes no domain lock into ${target} — the domain is remembered in the framework's .xenomoon.json.`,
    );
  }

  // 1. Scaffold the domain's starter into an empty/new target — ONLY if the domain ships one. An
  //    existing project (marker present) or a starterless domain is wired in place, never overwritten.
  const marker = path.join(target, DOMAIN.engine.projectFile);
  if (existsSync(marker)) {
    console.log(`new: ${target} already has a ${DOMAIN.engine.projectFile} — wiring it in place.`);
  } else if (DOMAIN.starter) {
    cpSync(path.join(frameworkDir, DOMAIN.starter), target, { recursive: true });
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
  const templatePath = resolveProjectTemplate(domainName, frameworkDir);
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
}

/**
 * Step 6 of `forge new` for one project: the first-boot flag + the policy block, create-only.
 * @param {{ target: string, hasPolicyBlock: boolean, spendPatterns: string[] }} opts
 * @returns {void}
 */
export function seedProjectSettings({ target, hasPolicyBlock, spendPatterns }) {
  // 6. First-boot flag: the SERVER kicks off onboarding in the first UI session (the session
  //    has the plugin loaded, so the command exists with full tooling — forms + board). Only
  //    set on a fresh install; a re-install of an already-onboarded project keeps its flag.
  //    Both live in the PROJECT's .xenomoon/settings.json (#84), never the install's .xenomoon.json.
  //    The consequential-action policy block is seeded here too, create-only: the knobs exist
  //    whether or not this writes them (normalizeActionPolicy defaults every absent key to "ask"),
  //    but an invisible knob is an undiscoverable one — the 2026-08 live test parked for days on
  //    gates whose `allow` opt-in nothing had ever surfaced. Only the literal "allow" allows; `ask`
  //    prompts a human, and an AUTONOMOUS run cannot answer a prompt, so a goal that orders a
  //    deploy-reaching push/merge (or an unattended Codex review) needs its key set to "allow".
  {
    /** @type {Record<string, unknown>} */
    const seed = {};
    if (!hasProjectSetting(target, "onboarded")) seed.onboarded = false;
    if (!hasPolicyBlock)
      seed.policy = {
        push: "ask",
        merge: "ask",
        dependencies: "ask",
        branchCreate: "ask",
        spend: "ask",
        spendPatterns,
        codexReview: "ask",
      };
    if (Object.keys(seed).length > 0) writeProjectSettings(target, seed);
  }
}
