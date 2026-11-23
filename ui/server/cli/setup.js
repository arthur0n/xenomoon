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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { updateInstallConfig } from "../../lib/install-config.js";
import { addProjectCommand } from "./project-entry.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli
const FRAMEWORK_DIR = path.join(here, "..", "..", "..");
const CONFIG_FILE = path.join(FRAMEWORK_DIR, ".xenomoon.json");

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
// apiKey is dropped (never overwrite a saved key with empty), a non-empty one replaces it. The
// block is built inside updateInstallConfig from the file as read for this write; an unreadable
// file ends the command with exit 1 and nothing is written.
{
  let enabledMsg = "(unchanged)";
  if (flag("hermes")) enabledMsg = "true";
  if (flag("hermes-off")) enabledMsg = "false";
  const res = updateInstallConfig(FRAMEWORK_DIR, (config) => {
    /** @type {Record<string, unknown>} */
    const next = { .../** @type {Record<string, unknown>} */ (config.hermes ?? {}) };
    if (flag("hermes")) next.enabled = true;
    if (flag("hermes-off")) next.enabled = false;
    if (val("hermes-url") != null) next.apiUrl = val("hermes-url");
    if (val("hermes-model") != null) next.model = val("hermes-model");
    if (val("hermes-key")) next.apiKey = val("hermes-key"); // blank/undefined → keep existing
    return { next: { ...config, hermes: next } };
  });
  if ("error" in res) {
    console.error(`bind-project-path: ${res.error}`);
    process.exit(1);
  }
  console.log(`Saved Hermes config → ${CONFIG_FILE}`);
  console.log(`  enabled: ${enabledMsg}`);
  if (val("hermes-model") != null) console.log(`  model:   ${val("hermes-model")}`);
  if (val("hermes-url") != null) console.log(`  apiUrl:  ${val("hermes-url")}`);
  if (val("hermes-key")) console.log(`  apiKey:  (saved, hidden)`);
}
