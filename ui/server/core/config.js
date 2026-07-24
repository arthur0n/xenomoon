// Server configuration — argv parsing, paths and policy constants, resolved
// once at startup. Importing this module also validates --allow and exits on a
// bad value (a load-time side effect, by design).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";
import { resolveActiveDomain } from "./domain-resolver.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** The ui/ directory (this file lives in ui/server/core/). */
export const UI_DIR = path.join(__dirname, "..", "..");
/** The framework root (the folder you cloned/forked). */
export const FRAMEWORK_DIR = path.join(UI_DIR, "..");
/** Saved-path config written by `npm run bind-project-path` — gitignored, so each fork
 * remembers its own bound project without committing it. */
export const CONFIG_FILE = path.join(FRAMEWORK_DIR, ".xenomoon.json");

/** OpenAI's official `codex-plugin-cc`, vendored on disk so the SDK can load it as a
 * SECOND local plugin (the SDK `plugins` option only accepts `{ type: "local" }`, no
 * marketplace/git refs). OFF by default and OUTSIDE the framework spine: nothing is
 * committed — `npm run codex:setup` clones it here (gitignored `vendor/`). The loadable
 * plugin root is `plugins/codex/` inside the cloned repo (it carries its own
 * `.claude-plugin/plugin.json`). session.js appends it only when `getCodexConfig().enabled`
 * AND this path exists, so a missing/disabled Codex changes nothing. */
export const CODEX_PLUGIN_DIR = path.join(
  FRAMEWORK_DIR,
  "vendor",
  "codex-plugin-cc",
  "plugins",
  "codex",
);

const args = process.argv.slice(2);

/** @typedef {{ name?: string, projectFile?: string }} EngineConfig */
/** Persisted Hermes block (see getHermesConfig). The apiKey lives only here (the
 * file is gitignored) or in env — it is never returned to the browser. `roles` is the
 * user's pick of the hats this agent wears in the hive (see the agents registry);
 * absent → the registry default.
 * @typedef {{ enabled?: boolean, apiUrl?: string, apiKey?: string, model?: string, roles?: string[] }} HermesConfig */
/** Persisted Codex block (see getCodexConfig). An on/off switch + role pick — auth is owned
 * by the local `codex` CLI (`codex login`), so there is no key or URL to store here.
 * @typedef {{ enabled?: boolean, roles?: string[] }} CodexConfig */
/** Persisted Kimi block (see getKimiConfig). An on/off switch + role pick — auth is owned by
 * the local `kimi` CLI (`kimi login` → ~/.kimi/config.toml), so there is no key to store here
 * (same zero-secret model as Codex). @typedef {{ enabled?: boolean, roles?: string[] }} KimiConfig */

/** Parsed `.xenomoon.json` (written by `npm run bind-project-path`), or `{}` if absent/invalid.
 * Read once: it carries both the saved project path and the engine block. */
const SAVED = (() => {
  try {
    return /** @type {{ projectDir?: string, domain?: string, domainDescriptor?: import("./domain-resolver.js").DomainDescriptor, port?: number, onboarded?: boolean, engine?: EngineConfig, assetLibrary?: string, hermes?: HermesConfig }} */ (
      parseJSON(readFileSync(CONFIG_FILE, "utf8"))
    );
  } catch {
    return {};
  }
})();

/** Where the framework reads the bound project from. The framework is
 * independent of the project: it points at this folder in place and never
 * vendors or tracks it. Resolution order (first hit wins):
 *   1. a path argument:        `npm start /path/to/project`
 *   2. the GAME_DIR env var
 *   3. the saved path:         `.xenomoon.json` (set once via `npm run bind-project-path`)
 *   4. default sibling:        `../project` (next to the framework folder)
 */
function resolveProjectDir() {
  const argPath = args.find((a) => !a.startsWith("--"));
  if (argPath) return path.resolve(argPath);
  if (process.env.GAME_DIR) return path.resolve(process.env.GAME_DIR);
  if (SAVED.projectDir) return path.resolve(SAVED.projectDir);
  return path.resolve(FRAMEWORK_DIR, "..", "project");
}

export const PROJECT_DIR = resolveProjectDir();

/** The installed domain's runtime descriptor (engine/project marker, inventory extensions,
 * commands, …). "Domain" is an INSTALL-TIME PICKER: `forge new --domain X` bakes X's descriptor into
 * `.xenomoon.json` (`domainDescriptor`) and copies X's capabilities into the single `plugin/` tree.
 * At runtime we read the baked descriptor — there is no live `domains/` on any runtime path. The
 * fallback to `resolveActiveDomain` covers a clone installed before this bake existed (migration). */
export const DOMAIN = SAVED.domainDescriptor ?? resolveActiveDomain(PROJECT_DIR, FRAMEWORK_DIR);

/** The framework's ONE capability tree (agents, skills, commands, hooks, orchestrator) packaged as a
 * local Claude Code plugin — loaded into every session via the SDK `plugins` option (see session.js)
 * so a project needs no copied capabilities; it stays pure and the plugin provides the framework
 * regardless of cwd. The domain picker installed the chosen pack's capabilities INTO this tree at
 * install time, so there is exactly one plugin dir at runtime (a domain is no longer a separate
 * runtime tree). */
export const FRAMEWORK_PLUGIN_DIR = path.join(FRAMEWORK_DIR, "plugin");

/** The active domain's engine/runtime descriptor. Resolution (first hit wins):
 * env (`ENGINE_NAME` / `ENGINE_PROJECT_FILE` / `ENGINE_BIN`) → `.xenomoon.json`
 * `engine` field → the active domain's defaults (`domain.json` `engine`).
 *   - `projectFile`: on-disk marker used to detect a project (e.g. `package.json`
 *     for the Node/webapp domain). */
export const ENGINE = {
  name: process.env.ENGINE_NAME ?? SAVED.engine?.name ?? DOMAIN.engine.name,
  projectFile:
    process.env.ENGINE_PROJECT_FILE ?? SAVED.engine?.projectFile ?? DOMAIN.engine.projectFile,
};
/** Capitalized engine display name for UI/CLI copy. */
export const ENGINE_LABEL = ENGINE.name.charAt(0).toUpperCase() + ENGINE.name.slice(1);

/** The project's mount name for the external shared-asset library — a symlink
 * materialize.js creates (`<project>/x-shared-assets` → ASSET_LIBRARY). One literal, shared
 * across config / materialize / asset-write / doctor / the client, to avoid drift.
 * (Engine-heritage machinery: inert unless a domain sets materializeIntoProject.) */
export const RES_ASSET_MOUNT = "x-shared-assets";

/** The external "shared asset library": free-library example assets (models/textures) the
 * project uses but kept OUTSIDE its tree, so the project stays pure. Symlinked into the
 * project at `x-shared-assets/`. The framework is per-project, so this dir is effectively
 * this project's, just external. Resolution (first hit wins): env `XENOMOON_ASSET_LIBRARY` → `.xenomoon.json`
 * `assetLibrary` → default sibling `../x-shared-assets`. May start empty — the framework
 * only needs to know where it is. */
export const ASSET_LIBRARY = path.resolve(
  process.env.XENOMOON_ASSET_LIBRARY ??
    SAVED.assetLibrary ??
    path.join(FRAMEWORK_DIR, "..", RES_ASSET_MOUNT),
);

// Expose the plugin and its knowledge base to the spawned session so framework agents
// can locate the library (and the framework itself, for promotion / self-improvement)
// regardless of the project cwd — they read/write via these paths, granted by
// `additionalDirectories` (see session.js). Inherited by the Claude Code subprocess.
process.env.XENOMOON_PLUGIN = FRAMEWORK_PLUGIN_DIR;
/** The framework-root logs dir (compliance/usage traces: caveman-gate.log, rtk-usage.log).
 * Anchored to FRAMEWORK_DIR (not derived from XENOMOON_PLUGIN, so the anchor survives any future
 * plugin-path move). Exported into the environment so the plugin's observe-only hooks
 * (caveman-reminder, rtk-usage-log), which run in the spawned session's subprocess, write to the
 * one framework-root dir. */
export const XENOMOON_LOG_DIR = path.join(FRAMEWORK_DIR, "logs");
process.env.XENOMOON_LOG_DIR = XENOMOON_LOG_DIR;
process.env.XENOMOON_LIBRARY = path.join(FRAMEWORK_PLUGIN_DIR, "library");
// The external shared-asset library (see ASSET_LIBRARY). Exported so the spawned session,
// its agents (asset-advisor reads/verifies the sourced file here) and validate.sh can locate
// it regardless of cwd; the project reaches the same bytes via the x-shared-assets symlink.
process.env.XENOMOON_ASSET_LIBRARY = ASSET_LIBRARY;

/** The generated per-project facts manifest (engine bin/version, render config, commands,
 * capability registry) — written by gen-manifest.js inside prepareGame(). Exported so the
 * spawned session and `tools/forge-facts` can read deterministic project facts instead of
 * re-deriving them (re-reading the engine's project file, re-globbing tools/) on every task. */
export const MANIFEST_FILE = path.join(PROJECT_DIR, ".xenomoon", "manifest.json");
process.env.XENOMOON_MANIFEST = MANIFEST_FILE;

/** Whether PROJECT_DIR actually holds a project for the active domain —
 * drives the startup warning and the UI's empty-state banner. */
export const PROJECT_FOUND = existsSync(path.join(PROJECT_DIR, ENGINE.projectFile));
// env PORT → the install's saved port (.xenomoon.json, asked once at install) → 3117.
export const PORT = Number(process.env.PORT ?? SAVED.port ?? 3117);

// Default permission policy for new sessions: ask | edits | all.
// Override per session from the UI header. AskUserQuestion always prompts.
export const POLICIES = ["ask", "edits", "all"];
export const DEFAULT_POLICY = args.find((a) => a.startsWith("--allow="))?.split("=")[1] ?? "ask";
if (!POLICIES.includes(DEFAULT_POLICY)) {
  console.error(`--allow must be one of: ${POLICIES.join(", ")}`);
  process.exit(1);
}
export const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

// In-process MCP tool the main agent calls to put a typed form in front of the
// user (see makeFormTool). Like AskUserQuestion, the form IS the user
// interaction, so it bypasses the permission policy.
export const FORM_TOOL = "mcp__ui__form";

// In-process MCP tool the orchestrator calls to manage its persistent task
// list (see task-tool.js). Like the form tool it's a UI-control surface, not a
// real side effect, so it bypasses the permission policy.
export const TASK_TOOL = "mcp__ui__tasks";

// In-process MCP tool a (typically backgrounded) agent calls to ask the user a
// question WITHOUT blocking — it files a question onto the board and returns
// immediately, where mcp__ui__form would pause the session waiting on a reply
// (impossible for a fire-and-forget worker). The orchestrator relays the answer on
// a later turn. UI-control surface, no real side effect, so it bypasses the policy.
export const ASK_TOOL = "mcp__ui__ask";

// In-process MCP tool an agent calls to request promoting a project-local capability
// (tool/skill/agent) into the framework plugin. Like the task tool it only files a
// record on the promotions board (a UI-control surface, no real side effect — the
// move happens later via `npm run promote`), so it bypasses the permission policy.
export const PROMOTE_TOOL = "mcp__ui__promote";

// In-process MCP tool the orchestrator calls to report on the standing Main Goal
// (Autonomous Mode): op "progress" stamps a one-line status, "complete" files the
// final report and turns the loop off, "pause" stops it. Like the other UI-control
// tools it only mutates local state + broadcasts (no real side effect), so it
// bypasses the permission policy.
export const AUTONOMOUS_TOOL = "mcp__ui__autonomous";

// In-process MCP tool the HIVE (orchestrator main loop) calls to delegate the heavy
// investigation half of research to an external Hermes Agent. Unlike the UI-control
// tools above it is a REAL side effect (a billable network call), so it deliberately
// has NO auto-allow branch in canUseTool — every dispatch hits the per-call
// permission gate (allow/deny in the web UI). Granted to the Hive only: no sub-agent
// frontmatter lists it, so only the foreground Hive can call it.
export const HERMES_TOOL = "mcp__ui__hermes";

// In-process MCP tool the HIVE calls to delegate a discrete implementation task to the
// external Kimi coder (kimi-cli driven over ACP in an isolated git worktree — see
// kimi-tool.js). Like HERMES_TOOL it is a REAL side effect (billable model run + code
// written in the worktree), so it has NO auto-allow branch in canUseTool — every dispatch
// hits the per-call permission gate. Granted to the Hive only.
export const KIMI_TOOL = "mcp__ui__kimi";

/** Hermes model ids for the settings dropdown; the user can also enter a custom id. The Nous
 * Portal (provider `nous`) routes non-Nous ids too (e.g. `qwen/*`, `z-ai/*`), so they're valid
 * picklist entries as long as they're in the Portal model catalog.
 * NOTE: this is a LABEL only — our `runs` call doesn't send a model, and the effective
 * model is chosen inside Hermes itself (`hermes config set model.default …` → `~/.hermes/config.yaml`).
 * Nous also recommends an agentic model to *drive* the agent, so treat these as a record of
 * which Hermes model you pointed Hermes at, not a control. */
export const HERMES_DEFAULT_MODEL = "nousresearch/hermes-4-70b";
export const HERMES_MODELS = [
  "z-ai/glm-5.2",
  "nousresearch/hermes-4-405b",
  HERMES_DEFAULT_MODEL,
  "nousresearch/hermes-4.3-36b",
];

/** Default hive roles per external agent, used when the saved block has no `roles` pick.
 * The full per-agent role catalog (what CAN be picked) lives in the agents registry
 * (ui/server/agents/registry.js); these are only the out-of-the-box selections. */
export const HERMES_DEFAULT_ROLES = ["researcher", "critic"];
export const CODEX_DEFAULT_ROLES = ["reviewer"];
export const KIMI_DEFAULT_ROLES = ["coder"];

/** First-boot onboarding flag — false until the server has injected the /onboard kickoff
 * into a session. Read per call (fresh) so the flip needs no restart.
 * @returns {boolean} true when onboarding was already kicked off (or the field is absent
 * on a pre-flag install — treat legacy installs as onboarded). */
export function getOnboarded() {
  try {
    const saved = /** @type {{ onboarded?: boolean }} */ (
      parseJSON(readFileSync(CONFIG_FILE, "utf8"))
    );
    return saved.onboarded !== false;
  } catch {
    return true;
  }
}

/** Flip the onboarded flag (one-shot kickoff guard), preserving every other field. */
export function markOnboarded() {
  /** @type {Record<string, unknown>} */
  let saved = {};
  try {
    saved = /** @type {Record<string, unknown>} */ (parseJSON(readFileSync(CONFIG_FILE, "utf8")));
  } catch {
    /* absent — nothing to preserve */
  }
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify({ ...saved, onboarded: true }, null, 2) + "\n");
  } catch {
    /* best-effort — a failed write just re-offers onboarding next boot */
  }
}

/** Effective Hermes config, resolved fresh on every call (env overrides → `.xenomoon.json`

 * `hermes` block → disabled), so switching it on from the CLI or the UI takes effect
 * WITHOUT a server restart. The apiKey is read here but must never be sent to the browser
 * (see hermesPublicConfig).
 * @returns {{ enabled: boolean, apiUrl: string | null, apiKey: string | null, model: string, roles: string[] }} */
export function getHermesConfig() {
  /** @type {HermesConfig} */
  let saved = {};
  try {
    saved =
      /** @type {{ hermes?: HermesConfig }} */ (parseJSON(readFileSync(CONFIG_FILE, "utf8")))
        .hermes ?? {};
  } catch {
    /* absent/invalid — treat as no saved block */
  }
  const env = process.env;
  const enabled =
    env.HERMES_ENABLED != null ? env.HERMES_ENABLED === "true" : Boolean(saved.enabled);
  return {
    enabled,
    apiUrl: env.HERMES_API_URL ?? saved.apiUrl ?? null,
    apiKey: env.HERMES_API_KEY ?? saved.apiKey ?? null,
    model: env.HERMES_MODEL ?? saved.model ?? HERMES_DEFAULT_MODEL,
    roles: saved.roles ?? HERMES_DEFAULT_ROLES,
  };
}

/** Browser-safe view of the Hermes config for /api/state: the secret key is replaced
 * by a boolean `hasKey`. @returns {{ enabled: boolean, apiUrl: string | null, model: string, hasKey: boolean, models: string[], roles: string[] }} */
export function hermesPublicConfig() {
  const c = getHermesConfig();
  return {
    enabled: c.enabled,
    apiUrl: c.apiUrl,
    model: c.model,
    hasKey: Boolean(c.apiKey),
    models: HERMES_MODELS,
    roles: c.roles,
  };
}

/** Merge a partial Hermes block into `.xenomoon.json`, preserving every other field
 * (projectDir, engine, …). An empty-string apiKey is dropped (don't overwrite a saved
 * key with blank when the UI didn't resend it); a non-empty one replaces it.
 * @param {HermesConfig} patch @returns {{ ok: true } | { error: string }} */
export function saveHermesConfig(patch) {
  /** @type {Record<string, unknown>} */
  let saved = {};
  try {
    saved = /** @type {Record<string, unknown>} */ (parseJSON(readFileSync(CONFIG_FILE, "utf8")));
  } catch {
    /* absent/invalid — start fresh */
  }
  const prev = /** @type {HermesConfig} */ (saved.hermes ?? {});
  /** @type {HermesConfig} */
  const next = { ...prev };
  if (patch.enabled != null) next.enabled = patch.enabled;
  if (patch.apiUrl != null) next.apiUrl = patch.apiUrl;
  if (patch.model != null) next.model = patch.model;
  if (patch.apiKey) next.apiKey = patch.apiKey; // blank/undefined → keep existing
  if (patch.roles != null) next.roles = patch.roles;
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify({ ...saved, hermes: next }, null, 2) + "\n");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "write failed" };
  }
}

/** Effective Codex config, resolved fresh on every call (env `CODEX_ENABLED` →
 * `.xenomoon.json` `codex` block → disabled), so toggling it from the UI or the CLI takes
 * effect WITHOUT a server restart (session.js re-reads it when a new session starts).
 * There is no secret here — Codex auth lives in the local `codex` CLI (`codex login`).
 * @returns {{ enabled: boolean, roles: string[] }} */
export function getCodexConfig() {
  /** @type {CodexConfig} */
  let saved = {};
  try {
    saved =
      /** @type {{ codex?: CodexConfig }} */ (parseJSON(readFileSync(CONFIG_FILE, "utf8"))).codex ??
      {};
  } catch {
    /* absent/invalid — treat as no saved block */
  }
  const env = process.env;
  const enabled = env.CODEX_ENABLED != null ? env.CODEX_ENABLED === "true" : Boolean(saved.enabled);
  return { enabled, roles: saved.roles ?? CODEX_DEFAULT_ROLES };
}

/** Browser-safe view of the Codex config for /api/state: `enabled` plus whether the plugin
 * has actually been vendored on disk (so the settings panel can tell "switched on but not yet
 * installed" from "ready"). No secrets — there are none. Deliberately does NOT shell out to
 * `codex` (that probe is the Settings "Test" button → codex-check.js), keeping /api/state cheap.
 * @returns {{ enabled: boolean, vendored: boolean, roles: string[] }} */
export function codexPublicConfig() {
  const c = getCodexConfig();
  return { enabled: c.enabled, vendored: existsSync(CODEX_PLUGIN_DIR), roles: c.roles };
}

/** Merge a partial Codex block into `.xenomoon.json`, preserving every other field
 * (projectDir, engine, hermes, …). @param {CodexConfig} patch @returns {{ ok: true } | { error: string }} */
export function saveCodexConfig(patch) {
  /** @type {Record<string, unknown>} */
  let saved = {};
  try {
    saved = /** @type {Record<string, unknown>} */ (parseJSON(readFileSync(CONFIG_FILE, "utf8")));
  } catch {
    /* absent/invalid — start fresh */
  }
  const prev = /** @type {CodexConfig} */ (saved.codex ?? {});
  /** @type {CodexConfig} */
  const next = { ...prev };
  if (patch.enabled != null) next.enabled = patch.enabled;
  if (patch.roles != null) next.roles = patch.roles;
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify({ ...saved, codex: next }, null, 2) + "\n");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "write failed" };
  }
}

/** Effective Kimi config, resolved fresh on every call (env `KIMI_ENABLED` → `.xenomoon.json`
 * `kimi` block → disabled), so toggling it from the UI or the CLI takes effect WITHOUT a
 * server restart (session.js re-reads it when a new session starts). There is no secret —
 * Kimi auth lives in the local `kimi` CLI (`kimi login`).
 * @returns {{ enabled: boolean, roles: string[] }} */
export function getKimiConfig() {
  /** @type {KimiConfig} */
  let saved = {};
  try {
    saved =
      /** @type {{ kimi?: KimiConfig }} */ (parseJSON(readFileSync(CONFIG_FILE, "utf8"))).kimi ??
      {};
  } catch {
    /* absent/invalid — treat as no saved block */
  }
  const env = process.env;
  const enabled = env.KIMI_ENABLED != null ? env.KIMI_ENABLED === "true" : Boolean(saved.enabled);
  return { enabled, roles: saved.roles ?? KIMI_DEFAULT_ROLES };
}

/** Browser-safe view of the Kimi config for the portal. No secrets — there are none.
 * Deliberately does NOT shell out to `kimi` (that probe is the portal "Test" button →
 * kimi-check.js), keeping the catalog route cheap.
 * @returns {{ enabled: boolean, roles: string[] }} */
export function kimiPublicConfig() {
  const c = getKimiConfig();
  return { enabled: c.enabled, roles: c.roles };
}

/** Merge a partial Kimi block into `.xenomoon.json`, preserving every other field
 * (projectDir, engine, hermes, codex, …). @param {KimiConfig} patch @returns {{ ok: true } | { error: string }} */
export function saveKimiConfig(patch) {
  /** @type {Record<string, unknown>} */
  let saved = {};
  try {
    saved = /** @type {Record<string, unknown>} */ (parseJSON(readFileSync(CONFIG_FILE, "utf8")));
  } catch {
    /* absent/invalid — start fresh */
  }
  const prev = /** @type {KimiConfig} */ (saved.kimi ?? {});
  /** @type {KimiConfig} */
  const next = { ...prev };
  if (patch.enabled != null) next.enabled = patch.enabled;
  if (patch.roles != null) next.roles = patch.roles;
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify({ ...saved, kimi: next }, null, 2) + "\n");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "write failed" };
  }
}

// Bare tool names auto-allowed (no permission prompt) for the whole session — the
// read/research/exec toolset background sub-agents need. This is the ONE lever that
// reaches a backgrounded (headless) sub-agent: it has no interactive approver, so
// the SDK auto-denies anything not pre-approved, and only BARE-name allows reach it
// — an argument-scoped settings rule like `Bash(**)`/`Read(**)` does NOT (that's why
// backgrounded researchers were denied Read/Bash/WebSearch/WebFetch despite the
// settings allowlist). Passed as SDK `allowedTools` (see session.js). Deliberately
// NOT Write/Edit — those are granted to backgrounded sub-agents by the plugin's
// `allow-project-edits.sh` PreToolUse hook (project/library paths, `.claude/` excluded).
// We do NOT use a per-agent `permission-mode: acceptEdits` for this: the CLI drops
// escalating modes that come from a repo/plugin trust tier (see
// filterEscalatingDefaultMode), so a plugin agent's acceptEdits is a no-op — which is
// what silently broke background edits. Authoring under `.claude/` stays a foreground,
// human-approved act (orchestrator rule). Bash is safe here because the
// destructive-git/-shell PreToolUse hooks gate it independently of the permission layer.
export const AUTO_ALLOW_TOOLS = ["Read", "Glob", "Grep", "Bash", "WebSearch", "WebFetch"];

// The main loop is an orchestrator: pinned model (not the user's default) and a
// routing-focused system prompt, editable in ui/orchestrator.md.
export const MODEL = args.find((a) => a.startsWith("--model="))?.split("=")[1] ?? "claude-opus-4-8";
// Reasoning effort for the orchestrator turn. The main loop routes and dispatches
// rather than reasoning hard, so default to a modest level; each sub-agent's own
// `effort:` frontmatter overrides this while that agent is active. The pinned
// model (claude-opus-4-8) supports low|medium|high|xhigh|max.
export const EFFORT = /** @type {import("@anthropic-ai/claude-agent-sdk").EffortLevel} */ (
  args.find((a) => a.startsWith("--effort="))?.split("=")[1] ?? "medium"
);
// The orchestrator routing prompt lives in the single capability tree at `plugin/orchestrator.md`
// (the domain picker installed it there). Read PER CALL (session start) — like getHermesConfig — so
// editing it takes effect on the NEXT SESSION without a server restart. The fallback to the live
// `domains/<name>/orchestrator.md` covers a clone installed before the picker copied it (migration).
/** @returns {string} */
export function getOrchestratorPrompt() {
  const installed = path.join(FRAMEWORK_PLUGIN_DIR, "orchestrator.md");
  if (existsSync(installed)) return readFileSync(installed, "utf8");
  return readFileSync(path.join(FRAMEWORK_DIR, DOMAIN.orchestrator), "utf8");
}
/** @returns {string} */
export function getHermesBlock() {
  return readFileSync(path.join(UI_DIR, "hermes-block.md"), "utf8");
}
/** Absolute path to the vendored Codex companion CLI — the same Node script the `/codex:*`
 * slash commands wrap. Injected into the Codex block (replacing the `{{CODEX_COMPANION}}`
 * placeholder) so the orchestrator can launch reviews/tasks ITSELF via Bash, not just tell the
 * user to type a slash command. The launch path is consent-gated by policy, not by capability. */
export const CODEX_COMPANION = path.join(CODEX_PLUGIN_DIR, "scripts", "codex-companion.mjs");
/** @returns {string} */
export function getCodexBlock() {
  return readFileSync(path.join(UI_DIR, "codex-block.md"), "utf8").replaceAll(
    "{{CODEX_COMPANION}}",
    CODEX_COMPANION,
  );
}
/** @returns {string} */
export function getKimiBlock() {
  return readFileSync(path.join(UI_DIR, "kimi-block.md"), "utf8");
}

// Claude Code's own transcript store for this project — every session here is
// listed and resumable, terminal ones included.
export const TRANSCRIPT_DIR = path.join(
  homedir(),
  ".claude",
  "projects",
  PROJECT_DIR.replace(/[/.]/g, "-"),
);

export const LOG_DIR = path.join(UI_DIR, "..", "logs");
