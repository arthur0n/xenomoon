// Hermes block setup, saved in .xenomoon.json (gitignored) in the framework root, preserving
// every other field. Bare-bones on purpose: it deliberately does NOT import config.js (which
// resolves the active domain and would throw when nothing is bound yet).
//
// It no longer binds a project (#65): an install has no single project, and the one command that
// adds a project is `npm run install-project -- <dir>`. A run with a project path, or with no
// argument at all (the old ../game default), exits 1 naming that command and writes nothing.
//
// Hermes (external researcher) is switched on here — these only touch the `hermes` block
// (use the web UI ⚙ Settings panel for the same):
//        npm run bind-project-path -- --hermes --hermes-key=sk-… --hermes-model=anthropic/claude-opus-4.7
//        npm run bind-project-path -- --hermes-off
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";
import { addProjectCommand } from "./project-entry.js";

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

// A project path (or no Hermes flag at all) asks for the old project binding: refuse it before
// any write, Hermes flags included.
const hermesArgs = argv.some((a) => a.startsWith("--hermes"));
const arg = argv.find((a) => !a.startsWith("--"));
if (arg || !hermesArgs) {
  console.error(
    "bind-project-path: an install no longer has one bound project; nothing was written.\n" +
      `  Add a project with: ${addProjectCommand(arg ? `"${path.resolve(arg)}"` : undefined)}`,
  );
  process.exit(1);
}

// Hermes block. Mirrors config.js saveHermesConfig semantics: preserve the prior block; a blank
// apiKey is dropped (never overwrite a saved key with empty), a non-empty one replaces it.
{
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
