// Hermes connection probe — the fast feedback loop for "is my gateway reachable
// from Xenomoon?". Hits the gateway's `GET /v1/models` (cheap, no model run, no
// billing) with the bearer key, so you can confirm URL + API_SERVER_KEY are right
// BEFORE going three approvals deep into a Hive loop.
//
//   • Importable: `checkHermes({ apiUrl, apiKey })` → a plain verdict object.
//       Used by the UI's `POST /api/hermes/check` (the ⚙ Settings "Test connection"
//       button) and could be reused elsewhere.
//   • Runnable:   `npm run hermes:check` probes the currently-saved config and prints
//       a one-line verdict — handy while standing Hermes up from the terminal.
//
// Remember the two keys (see HERMES.md): the value tested here is the LOCAL
// `API_SERVER_KEY` you invented for your gateway — NOT the billable provider key,
// which lives inside Hermes (`hermes setup`) and is never seen by Xenomoon.
import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { parseJSON } from "../../../lib/json.js";
import { getHermesConfig } from "../../core/config.js";
import { hermesHome } from "./hermes-profile.js";

/** The verdict of one probe. `reachable` = the gateway answered at all; `authOk` =
 * the bearer key was accepted; `ok` = both, with a usable model list.
 * `caps` carries the runs-API feature flags the Hermes tool depends on (poll status + stream events).
 * `webBackend` = the locally-detected web research backend (null = none usable), and
 * `caveat` degrades an ok verdict when the web toolset is on with no backend behind it.
 * @typedef {{
 *   ok: boolean,
 *   reachable: boolean,
 *   authOk: boolean,
 *   status?: number,
 *   models?: string[],
 *   tools?: string[],
 *   caps?: { runStatus: boolean, runEventsSse: boolean },
 *   webBackend?: string | null,
 *   caveat?: string,
 *   error?: string,
 * }} HermesCheck */

const baseOf = (/** @type {string} */ url) => url.replace(/\/+$/, "");

// --- Web research backend detection ---------------------------------------------
// The gateway answers /v1/models and even lists the `web` toolset with NO search
// provider configured — runs then return uncited prose from model memory (and
// retries have been observed fabricating citations). This is the blind spot that
// made the panel read green while research was broken, so the probe checks the
// backend credentials LOCALLY (the gateway runs on this machine) and degrades the
// verdict with a caveat instead of staying silent.

/** Env keys that make a web backend usable, per backend (any one suffices). */
const WEB_BACKEND_KEYS = /** @type {const} */ ([
  ["firecrawl", ["FIRECRAWL_API_KEY", "FIRECRAWL_API_URL", "FIRECRAWL_GATEWAY_URL"]],
  ["exa", ["EXA_API_KEY"]],
  ["parallel", ["PARALLEL_API_KEY"]],
]);

/** Active (non-comment) KEY=value entries of a .env file, or {} when unreadable.
 * @param {string} file @returns {Record<string, string>} */
function readEnvFile(file) {
  /** @type {Record<string, string>} */
  const out = {};
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq > 0) out[t.slice(0, eq)] = t.slice(eq + 1).trim();
  }
  return out;
}

/** Python interpreters that might be the Hermes venv (where `ddgs` would live).
 * @returns {string[]} */
export function hermesPythonCandidates() {
  const cands = [path.join(homedir(), ".hermes", "hermes-agent", "venv", "bin", "python")];
  // The `hermes` shim's shebang points at the real interpreter.
  try {
    const shim = spawnSync("which", ["hermes"], { encoding: "utf8" }).stdout?.trim();
    if (shim) {
      const first = readFileSync(shim, "utf8").split("\n")[0] ?? "";
      const m = first.match(/^#!\s*(\S+python\S*)/);
      if (m?.[1]) cands.push(m[1]);
    }
  } catch {
    /* shim unreadable — fall through to the fixed candidate */
  }
  return cands.filter((p) => existsSync(p));
}

/** True when the free `ddgs` (DuckDuckGo) package is importable by Hermes' python.
 * @returns {boolean} */
export function ddgsAvailable() {
  for (const py of hermesPythonCandidates()) {
    const r = spawnSync(py, ["-c", "import ddgs"], { stdio: "ignore", timeout: 8000 });
    if (r.status === 0) return true;
  }
  return false;
}

/** Which web research backend the profile can actually use right now, resolved the way
 * Hermes does: a credentialed provider (profile .env or the process env), else the free
 * `ddgs` package. `null` backend = research runs will have NO retrieval.
 * @param {string} [profile]
 * @returns {{ backend: string | null, source: string }} */
export function detectWebBackend(profile) {
  const home = hermesHome(profile ?? getHermesConfig().profile) ?? path.join(homedir(), ".hermes");
  const envFile = path.join(home, ".env");
  const fileEnv = readEnvFile(envFile);
  for (const [backend, keys] of WEB_BACKEND_KEYS) {
    for (const key of keys) {
      if (fileEnv[key]) return { backend, source: `${key} in ${envFile}` };
      if (process.env[key]) return { backend, source: `${key} in the process environment` };
    }
  }
  if (ddgsAvailable()) return { backend: "ddgs", source: "free ddgs package (search only)" };
  return { backend: null, source: "" };
}

// --- Local hermes-agent patch detection ------------------------------------------
// Upstream hermes-agent bug (NousResearch/hermes-agent#60035): a profile whose
// auth.json holds a token-less `providers.nous` shell (left behind by a terminal
// refresh failure) dead-ends the gateway's credential path BEFORE it consults the
// shared cross-profile store — the profile is bricked and no re-login can rescue it.
// We carry the one-function fix as a vendored diff (nous-shared-store-rescue.patch,
// applied to the local hermes-agent checkout). A hermes update silently reverts it,
// so the probe checks the installed source for the patch's sentinel string and
// degrades the verdict when it is gone.

/** Persist-reason string the patch introduces — its presence in the installed
 * `hermes_cli/auth.py` proves the patch (or an equivalent upstream fix) is applied. */
export const NOUS_RESCUE_SENTINEL = "post_shared_merge_no_access_token";

/** Vendored diff, kept next to this file. */
export const NOUS_RESCUE_PATCH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "nous-shared-store-rescue.patch",
);

/** Locate the installed `hermes_cli/auth.py` next to a Hermes venv python.
 * Covers the editable checkout (repo root above the venv) and wheel installs
 * (site-packages inside the venv). @returns {string | null} */
export function hermesAuthPyPath() {
  for (const py of hermesPythonCandidates()) {
    const venvRoot = path.dirname(path.dirname(py)); // …/venv
    const repoRoot = path.dirname(venvRoot); // editable: the checkout
    const cands = [path.join(repoRoot, "hermes_cli", "auth.py")];
    const libDir = path.join(venvRoot, "lib");
    try {
      for (const entry of readdirSync(libDir)) {
        cands.push(path.join(libDir, entry, "site-packages", "hermes_cli", "auth.py"));
      }
    } catch {
      /* no lib dir — editable candidate only */
    }
    for (const cand of cands) if (existsSync(cand)) return cand;
  }
  return null;
}

/** Whether the local hermes-agent still carries the Nous shared-store rescue fix.
 * `applied: null` = Hermes source not found on this machine (nothing to verify).
 * @returns {{ applied: boolean | null, authPy: string | null }} */
export function checkNousRescuePatch() {
  const authPy = hermesAuthPyPath();
  if (!authPy) return { applied: null, authPy: null };
  try {
    return { applied: readFileSync(authPy, "utf8").includes(NOUS_RESCUE_SENTINEL), authPy };
  } catch {
    return { applied: null, authPy };
  }
}

/** The caveat line for a gateway running unpatched hermes-agent source. */
export const NOUS_RESCUE_CAVEAT =
  "Local hermes-agent is MISSING the Nous shared-store rescue fix (upstream bug #60035) — " +
  "a Hermes update likely reverted it. Profiles can brick on token refresh (UI dispatches " +
  "fail with 'No access token found' while the terminal works). Re-apply: " +
  `\`git -C ~/.hermes/hermes-agent apply ${NOUS_RESCUE_PATCH}\`, then restart the gateway.`;

/** Stamp `caveat` when the LOCAL gateway runs unpatched hermes source. Remote gateways
 * are skipped — we can only inspect this machine. Never overrides an existing caveat
 * (the web-backend one is the more actionable of the two); appends instead.
 * @param {HermesCheck} verdict @param {string} base */
function applyPatchVerdict(verdict, base) {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(`${base}/`)) return;
  if (checkNousRescuePatch().applied !== false) return;
  verdict.caveat = verdict.caveat
    ? `${verdict.caveat} ALSO: ${NOUS_RESCUE_CAVEAT}`
    : NOUS_RESCUE_CAVEAT;
}

/** Stamp `webBackend`/`caveat` onto an ok verdict: when the gateway is LOCAL and the web
 * toolset is (or may be) enabled, detect the backend and degrade the verdict if none is
 * usable. Remote gateways are skipped — we can only inspect this machine.
 * @param {HermesCheck} verdict @param {string} base @param {string} [profile] */
function applyWebVerdict(verdict, base, profile) {
  const tools = verdict.tools;
  const wantsWeb = !tools || tools.includes("web") || tools.includes("search");
  if (!wantsWeb || !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(`${base}/`)) return;
  const web = detectWebBackend(profile);
  verdict.webBackend = web.backend;
  if (!web.backend) verdict.caveat = NO_WEB_BACKEND_CAVEAT;
}

/** The caveat line for a probe whose gateway is up but whose web toolset has no usable
 * backend — worded for the ⚙ Settings verdict line. */
export const NO_WEB_BACKEND_CAVEAT =
  "Gateway is up, but NO web search backend is configured — research runs will return " +
  "uncited prose from model memory. Fix: `npm run hermes:setup` (seeds a Firecrawl key " +
  "or the free ddgs fallback), then restart the gateway.";

/** The dispatch-refusal message for the same state — worded for the Hive (hermes-tool.js
 * returns it instead of creating a run). */
export const NO_WEB_BACKEND_DISPATCH_MSG =
  "Hermes has NO web search backend configured — a run would return uncited prose from " +
  "model memory (this exact state has produced fabricated citations before). Dispatch " +
  "REFUSED. This is a BROKEN TOOL: surface it to the human with the fix — `npm run " +
  "hermes:setup` seeds a Firecrawl key (free tier) or the free ddgs fallback into the " +
  "profile's .env, then the gateway must be restarted. Do NOT re-dispatch until `npm run " +
  "hermes:check` shows a web backend; for retrieval work in the meantime, dispatch the " +
  "matching xenomoon:*-researcher yourself.";

/** Best-effort: enabled toolset names on the API path (`GET /v1/toolsets`). undefined if the
 * endpoint is missing/old. @param {string} base @param {string | null} key @param {AbortSignal} signal
 * @returns {Promise<string[] | undefined>} */
async function fetchEnabledTools(base, key, signal) {
  try {
    const res = await fetch(`${base}/v1/toolsets`, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
      signal,
    });
    if (!res.ok) return undefined;
    const body = /** @type {{ data?: Array<{ name?: string, enabled?: boolean }> } | null} */ (
      safeParse(await res.text().catch(() => "{}"))
    );
    return (body?.data ?? [])
      .filter((t) => t.enabled === true && typeof t.name === "string")
      .map((t) => /** @type {string} */ (t.name));
  } catch {
    return undefined;
  }
}

/** Best-effort: the runs-API feature flags from `GET /v1/capabilities` — the surface the Hermes
 * tool relies on (poll run status + stream events). undefined if the endpoint is missing/old.
 * @param {string} base @param {string | null} key @param {AbortSignal} signal
 * @returns {Promise<{ runStatus: boolean, runEventsSse: boolean } | undefined>} */
async function fetchCapabilities(base, key, signal) {
  try {
    const res = await fetch(`${base}/v1/capabilities`, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
      signal,
    });
    if (!res.ok) return undefined;
    const body = /** @type {{ features?: Record<string, unknown> } | null} */ (
      safeParse(await res.text().catch(() => "{}"))
    );
    const f = body?.features ?? {};
    return { runStatus: f.run_status === true, runEventsSse: f.run_events_sse === true };
  } catch {
    return undefined;
  }
}

/** Probe a Hermes gateway with `GET /v1/models`.
 * @param {{ apiUrl?: string | null, apiKey?: string | null, profile?: string }} cfg
 * @param {number} [timeoutMs] @returns {Promise<HermesCheck>} */
export async function checkHermes(cfg, timeoutMs = 8000) {
  const apiUrl = cfg.apiUrl ?? null;
  const apiKey = cfg.apiKey ?? null;
  if (!apiUrl) {
    return { ok: false, reachable: false, authOk: false, error: "No Hermes server URL set." };
  }
  const base = baseOf(apiUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(
    () => {
      ctrl.abort();
    },
    Math.max(1, timeoutMs),
  );
  try {
    const res = await fetch(`${base}/v1/models`, {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      signal: ctrl.signal,
    });
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        reachable: true,
        authOk: false,
        status: res.status,
        error: "Gateway reachable, but the server key was rejected — check API_SERVER_KEY.",
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        reachable: true,
        authOk: true,
        status: res.status,
        error: `Gateway responded ${res.status} ${res.statusText}.`,
      };
    }
    const body = /** @type {{ data?: Array<{ id?: string }> } | null} */ (
      safeParse(await res.text().catch(() => "{}"))
    );
    const models = (body?.data ?? []).map((m) => m.id).filter((id) => typeof id === "string");
    const tools = await fetchEnabledTools(base, apiKey, ctrl.signal);
    const caps = await fetchCapabilities(base, apiKey, ctrl.signal);
    /** @type {HermesCheck} */
    const verdict = {
      ok: true,
      reachable: true,
      authOk: true,
      status: res.status,
      models,
      tools,
      caps,
    };
    applyWebVerdict(verdict, base, cfg.profile);
    applyPatchVerdict(verdict, base);
    return verdict;
  } catch (err) {
    const aborted = ctrl.signal.aborted;
    return {
      ok: false,
      reachable: false,
      authOk: false,
      error: aborted
        ? `No response within ${Math.round(timeoutMs / 1000)}s — is \`hermes gateway\` running at ${base}?`
        : `Can't reach ${base}: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Parse JSON or null. @param {string} s @returns {unknown} */
function safeParse(s) {
  try {
    return parseJSON(s);
  } catch {
    return null;
  }
}

// --- CLI: `npm run hermes:check` -------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cfg = getHermesConfig();
  if (!cfg.enabled) {
    console.log(
      "Hermes is OFF — enable it in ⚙ Settings or `npm run bind-project-path -- --hermes`.",
    );
  }
  // Toolsets that execute on YOUR machine — flag loudly if the API path has them.
  const MACHINE = ["terminal", "file", "code_execution", "browser", "process"];
  checkHermes(cfg)
    .then((r) => {
      if (!r.ok) {
        console.error(`✗ ${r.error ?? "Hermes unreachable."}`);
        process.exitCode = 1;
        return;
      }
      const list = r.models?.length ? ` — models: ${r.models.slice(0, 5).join(", ")}` : "";
      console.log(`✓ Hermes reachable at ${cfg.apiUrl}${list}`);
      if (r.caveat) {
        console.log(`  ⚠ ${r.caveat}`);
      } else if (r.webBackend) {
        console.log(`  ✓ web research backend: ${r.webBackend}`);
      }
      if (r.tools) {
        console.log(`  API-path tools enabled: ${r.tools.join(", ") || "(none)"}`);
        const risky = r.tools.filter((t) => MACHINE.includes(t));
        console.log(
          risky.length
            ? `  ⚠ MACHINE ACCESS ENABLED: ${risky.join(", ")} — run on THIS machine. Restrict with \`npm run hermes:setup\`.`
            : "  ✓ no machine-access tools (terminal/file/code) on the API path.",
        );
      }
      if (r.caps) {
        console.log(
          r.caps.runStatus
            ? `  ✓ runs API ready (run_status${r.caps.runEventsSse ? " + events SSE" : ""}) — findings delivery supported.`
            : "  ⚠ gateway lacks run_status — the Hermes bridge can't read findings; update Hermes.",
        );
      }
    })
    .catch((e) => {
      console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    });
}
