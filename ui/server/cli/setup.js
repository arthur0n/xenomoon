// One-time setup: remember which project the framework points at (its absolute path), saved in
// .xenomoon.json (gitignored) in the framework root, preserving any engine / hermes / domain block
// already there. Bare-bones on purpose: this is the BOOTSTRAP step, so it must run BEFORE a domain
// is bound — it deliberately does NOT import config.js (which resolves the active domain and would
// throw when nothing is bound yet). It only touches .xenomoon.json.
//
// Usage: npm run bind-project-path -- ../project     (or any path to your project)
//        npm run bind-project-path                    (defaults to ../game, the sibling folder)
//
// Hermes (external researcher) can be switched on here too — these only touch the
// `hermes` block, never the project path (use the web UI ⚙ Settings panel for the same):
//        npm run bind-project-path -- --hermes --hermes-key=sk-… --hermes-model=anthropic/claude-opus-4.7
//        npm run bind-project-path -- --hermes-off
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";
import { validateProjectPath } from "./validate-path.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli
const FRAMEWORK_DIR = path.join(here, "..", "..", "..");
const CONFIG_FILE = path.join(FRAMEWORK_DIR, ".xenomoon.json");

/** Read .xenomoon.json (or {} if absent/invalid). @returns {Record<string, unknown>} */
function readConfig() {
  try {
    return /** @type {Record<string, unknown>} */ (parseJSON(readFileSync(CONFIG_FILE, "utf8")));
  } catch {
    return {};
  }
}

/** Merge a patch into .xenomoon.json, preserving every other field.
 * @param {Record<string, unknown>} patch */
function mergeConfig(patch) {
  writeFileSync(CONFIG_FILE, JSON.stringify({ ...readConfig(), ...patch }, null, 2) + "\n");
}

const argv = process.argv.slice(2);
/** @param {string} name @returns {boolean} */
const flag = (name) => argv.includes(`--${name}`);
/** @param {string} name @returns {string | undefined} */
const val = (name) =>
  argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");

// Any --hermes* flag means this run is (also) about the Hermes block. Mirrors config.js
// saveHermesConfig semantics: preserve the prior block; a blank apiKey is dropped (never overwrite
// a saved key with empty), a non-empty one replaces it.
const hermesArgs = argv.some((a) => a.startsWith("--hermes"));
if (hermesArgs) {
  const saved = readConfig();
  /** @type {Record<string, unknown>} */
  const next = { .../** @type {Record<string, unknown>} */ (saved.hermes ?? {}) };
  let enabledMsg = "(unchanged)";
  if (flag("hermes")) {
    next.enabled = true;
    enabledMsg = "true";
  }
  if (flag("hermes-off")) {
    next.enabled = false;
    enabledMsg = "false";
  }
  if (val("hermes-url") != null) next.apiUrl = val("hermes-url");
  if (val("hermes-model") != null) next.model = val("hermes-model");
  if (val("hermes-key")) next.apiKey = val("hermes-key"); // blank/undefined → keep existing
  mergeConfig({ hermes: next });
  console.log(`Saved Hermes config → ${CONFIG_FILE}`);
  console.log(`  enabled: ${enabledMsg}`);
  if (val("hermes-model") != null) console.log(`  model:   ${val("hermes-model")}`);
  if (val("hermes-url") != null) console.log(`  apiUrl:  ${val("hermes-url")}`);
  if (val("hermes-key")) console.log(`  apiKey:  (saved, hidden)`);
}

// Project-path setup: skip entirely on a Hermes-only run (no explicit path arg), so
// `npm run bind-project-path` never clobbers the saved project path with the ../game default.
const arg = argv.find((a) => !a.startsWith("--"));
if (arg || !hermesArgs) {
  const target = path.resolve(arg ?? path.join(FRAMEWORK_DIR, "..", "game"));
  // Validate BEFORE saving — any local absolute path works (validation, not a folder
  // convention); hard rows block, soft rows warn (--allow-nonlocal downgrades locality).
  const problems = validateProjectPath(target, path.resolve(FRAMEWORK_DIR), {
    allowNonlocal: argv.includes("--allow-nonlocal"),
  });
  for (const p of problems.filter((p) => !p.hard)) console.warn(`⚠ ${p.msg}`);
  const hard = problems.filter((p) => p.hard);
  if (hard.length) {
    for (const p of hard) console.error(`✗ ${p.msg}`);
    process.exit(1);
  }
  mergeConfig({ projectDir: target });
  console.log(`Saved project path → ${CONFIG_FILE}`);
  console.log(`  projectDir: ${target}`);
  // Domain-agnostic bootstrap: no engine project marker is named here (no domain is resolved yet).
  // `forge new --domain <name>` is the command that binds the project to a domain and validates it.
  console.log(`  Next: bind a domain — npm run install-project -- "${target}" --domain <name>`);
}
