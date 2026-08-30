// Codex readiness probe — the fast "is the Codex reviewer actually usable from here?"
// check. Unlike the Hermes probe (an HTTP call to a gateway), Codex is a LOCAL CLI, so
// this just inspects the machine: is the `codex` binary on PATH, are you logged in, and
// has the plugin been vendored on disk? No network, no billing.
//
//   • Importable: `checkCodex()` → a plain verdict object.
//       Used by the UI's `POST /api/codex/check` (the ⚙ Settings "Test" button).
//   • Runnable:   `npm run codex:check` prints a one-line readiness summary — handy while
//       standing Codex up from the terminal.
//
// Auth is owned by the Codex CLI, not by Xenomoon: `codex login status` exits 0 when
// credentials are present (file-based auth.json under CODEX_HOME, default ~/.codex, or the
// OS credential store) and 1 otherwise — so we shell that as the source of truth and never
// store a key ourselves. The plugin is "vendored" once `npm run codex:setup` clones it.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  getCodexConfig,
  saveCodexConfig,
  CODEX_PLUGIN_DIR,
  CODEX_COMPANION,
} from "../../core/config.js";

/** The verdict of one probe. `cli` = the `codex` binary is on PATH; `authOk` = `codex login
 * status` reports credentials; `vendored` = the plugin is cloned on disk (loadable). `ok` = all
 * three (Codex is ready to review). `enabled` mirrors the saved switch, for the summary line.
 * `authMethod`/`model` describe HOW it'll route; `caveat` warns when that combination won't —
 * e.g. a *-codex model on a ChatGPT-account login (rejected by OpenAI; needs gpt-5.5 or a key).
 * `verbDrift` is WARN-ONLY and deliberately not part of `ok` or `caveat`: it is a prediction
 * parsed from the vendored companion's help text (upstream can drift under us), and folding it
 * into `caveat` would paint the Settings card red and fail `npm run codex:check` on a cosmetic
 * help-text reformat.
 * @typedef {{
 *   ok: boolean,
 *   enabled: boolean,
 *   cli: boolean,
 *   version?: string,
 *   authOk: boolean,
 *   authMode?: string,
 *   authMethod?: "chatgpt" | "apiKey",
 *   model?: string,
 *   vendored: boolean,
 *   caveat?: string,
 *   verbDrift?: string,
 *   error?: string,
 * }} CodexCheck */

// The companion verbs the framework's `mcp__ui__codex` tool maps its kinds onto:
// review → `review`, adversarial-review → `adversarial-review`, audit → `task`. If a synced
// vendored clone stops advertising one, the tool's paid calls start failing at run time — the
// drift probe below warns at check time instead.
const REQUIRED_VERBS = ["review", "adversarial-review", "task"];

/** Which of the verbs the tool depends on are absent from the companion's own help text. Pure so
 * the rule is unit-testable without a vendored clone. Word-boundary matched: `review` in the help
 * must not satisfy `adversarial-review` (nor vice versa). @param {string} help
 * @param {string[]} [required] @returns {string[]} */
export function missingVerbs(help, required = REQUIRED_VERBS) {
  return required.filter((verb) => {
    const escaped = verb.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(help);
  });
}

/** Ask the vendored companion for its usage text and compare against REQUIRED_VERBS. A local
 * Node process printing help — no `codex` binary, no network, no billing. `probed:false` when
 * the companion is not vendored or printed nothing (that absence is already reported elsewhere).
 * @param {number} [timeoutMs] @returns {{ probed: boolean, missing?: string[] }} */
function probeCompanionVerbs(timeoutMs = 3000) {
  if (!existsSync(CODEX_COMPANION)) return { probed: false };
  const r = spawnSync(process.execPath, [CODEX_COMPANION, "--help"], {
    encoding: "utf8",
    timeout: timeoutMs,
  });
  // Help often lands on stderr, and the companion may exit nonzero on --help — the text is what
  // matters, not the status.
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if (!out) return { probed: false };
  return { probed: true, missing: missingVerbs(out) };
}

/** The warn-only drift line for checkCodex, or undefined when there is nothing to say.
 * @param {boolean} vendored @returns {string | undefined} */
function verbDriftWarning(vendored) {
  if (!vendored) return undefined;
  const drift = probeCompanionVerbs();
  if (!drift.probed || !drift.missing || drift.missing.length === 0) return undefined;
  return (
    `vendored companion no longer advertises: ${drift.missing.join(", ")} — ` +
    "`mcp__ui__codex` maps its kinds onto those verbs; re-run `npm run codex:setup` " +
    "(or pin --ref=<tag>)."
  );
}

/** Run a `codex …` subcommand, returning {status, out} (out = trimmed stdout, or stderr on
 * failure). status is null when the binary isn't found (ENOENT). @param {string[]} argv
 * @param {number} timeoutMs @returns {{ status: number | null, out: string }} */
function runCodex(argv, timeoutMs) {
  const r = spawnSync("codex", argv, { encoding: "utf8", timeout: timeoutMs });
  const out = (r.stdout || r.stderr || "").trim();
  return { status: r.status, out };
}

/** Codex's default model — `model = "…"` from $CODEX_HOME/config.toml (default ~/.codex), or
 * null if unset/absent. This is what `codex review`/the plugin route to when no per-call
 * override is given. @returns {string | null} */
function configuredModel() {
  const env = process.env.CODEX_HOME;
  const home = env?.trim() ? env : path.join(homedir(), ".codex");
  try {
    return (
      readFileSync(path.join(home, "config.toml"), "utf8").match(
        /^\s*model\s*=\s*["']([^"']+)["']/m,
      )?.[1] ?? null
    );
  } catch {
    return null;
  }
}

/** Classify the `codex login status` headline into an auth method.
 * @param {string} [authMode] @returns {"chatgpt" | "apiKey" | undefined} */
function authMethodOf(authMode) {
  if (/chatgpt/i.test(authMode ?? "")) return "chatgpt";
  if (/api[\s-]?key/i.test(authMode ?? "")) return "apiKey";
  return undefined;
}

/** Warn when a *-codex model is paired with a ChatGPT login — OpenAI rejects those there
 * (`400 … not supported when using Codex with a ChatGPT account`), the exact trap that makes
 * every review fail despite a successful login. @param {"chatgpt" | "apiKey" | undefined} authMethod
 * @param {string} [model] @returns {string | undefined} */
function chatgptCodexCaveat(authMethod, model) {
  if (authMethod !== "chatgpt" || !model || !/codex/i.test(model)) return undefined;
  return `default model "${model}" is a *-codex variant — rejected on ChatGPT-account auth. Set model="gpt-5.5" in ~/.codex/config.toml (or use an API key: \`codex login --with-api-key\`).`;
}

/** Persist the cost basis the login mode implies: a ChatGPT-account login is the user's
 * SUBSCRIPTION (zero marginal cost → the orchestrator uses Codex freely at quality gates); an
 * API key is metered (deliberate dispatch). Auto-detected so it stays true to the actual auth.
 * @param {"chatgpt" | "apiKey" | undefined} authMethod */
function persistCostBasis(authMethod) {
  if (!authMethod) return;
  saveCodexConfig({ costBasis: authMethod === "chatgpt" ? "subscription" : "metered" });
}

/** Inspect the local Codex install. Synchronous (cheap local spawns); returns a verdict the
 * Settings panel and the CLI both render. `persist:false` skips the costBasis save below — the
 * mcp tool's pre-spend probe passes it so a review call never mutates `.xenomoon.json` (which
 * would race the UI's own config writes). @param {number} [timeoutMs]
 * @param {{ persist?: boolean }} [opts] @returns {CodexCheck} */
export function checkCodex(timeoutMs = 8000, { persist = true } = {}) {
  const enabled = getCodexConfig().enabled;
  const vendored = existsSync(path.join(CODEX_PLUGIN_DIR, ".claude-plugin", "plugin.json"));

  const ver = runCodex(["--version"], timeoutMs);
  if (ver.status === null) {
    return {
      ok: false,
      enabled,
      cli: false,
      authOk: false,
      vendored,
      error:
        "`codex` is not on PATH — install it with `npm i -g @openai/codex`, then `codex login`.",
    };
  }
  const version = ver.out.replace(/^codex(?:-cli)?\s+/i, "").trim() || undefined;

  // `codex login status` exits 0 when authenticated, 1 when not. The printed line names the
  // active sign-in mode (ChatGPT account vs API key) — surface it for context.
  const auth = runCodex(["login", "status"], timeoutMs);
  const authOk = auth.status === 0;
  const firstLine = auth.out.split("\n")[0]?.trim();
  const authMode = authOk && firstLine ? firstLine : undefined;
  const authMethod = authMethodOf(authMode);
  // A *-codex model (e.g. gpt-5.1-codex-max) is rejected on a ChatGPT-account login — OpenAI
  // only routes general models there (gpt-5.5, gpt-5.4-mini). "Logged in" wouldn't catch this;
  // the model does. Warn before the first review fails.
  const model = configuredModel() ?? undefined;
  const caveat = authOk ? chatgptCodexCaveat(authMethod, model) : undefined;
  if (persist) persistCostBasis(authMethod);

  return {
    // cli is already proven (we returned early otherwise) — ready iff logged in AND vendored.
    ok: authOk && vendored,
    enabled,
    cli: true,
    version,
    authOk,
    authMode,
    authMethod,
    model,
    vendored,
    caveat,
    verbDrift: verbDriftWarning(vendored),
    error: authOk
      ? vendored
        ? undefined
        : "Codex CLI is ready, but the review plugin isn't vendored yet — run `npm run codex:setup`."
      : "Not logged in — run `codex login` (ChatGPT account or API key).",
  };
}

// --- CLI: `npm run codex:check` --------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = checkCodex();
  if (!r.enabled) {
    console.log("Codex is OFF — enable it in ⚙ Settings or `npm run codex:setup`.");
  }
  if (!r.cli) {
    console.error(`✗ ${r.error}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ codex CLI present${r.version ? ` (v${r.version})` : ""}`);
    console.log(
      r.authOk
        ? `  ✓ logged in${r.authMode ? ` — ${r.authMode}` : ""}`
        : "  ✗ not logged in — run `codex login` (ChatGPT account or API key).",
    );
    console.log(
      r.vendored
        ? `  ✓ review plugin vendored → ${CODEX_PLUGIN_DIR}`
        : "  ✗ review plugin not vendored — run `npm run codex:setup`.",
    );
    if (r.model) console.log(`  · default model: ${r.model}`);
    if (r.caveat) console.log(`  ⚠ ${r.caveat}`);
    // Warn-only by design: drift is parsed from help text, so it never flips the exit code.
    if (r.verbDrift) console.log(`  ⚠ ${r.verbDrift}`);
    console.log(
      r.caveat
        ? "• Codex is installed, but the configured model will be rejected — fix it above, then re-check."
        : r.ok
          ? "✓ Codex is ready — type `/codex:review` in a session (or terminal Claude Code) to review."
          : "• Codex is not fully set up yet (see above).",
    );
    if (!r.ok || r.caveat) process.exitCode = 1;
  }
}
