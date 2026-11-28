#!/usr/bin/env node
/* global process */
// PreToolUse(select_browser | switch_browser) — keeps the Chrome profile to the project's own (#110).
//
// A web-domain session starts with the Claude in Chrome tools, and in autonomous mode (or under
// the session policy "all") the permission function allows every call. So any agent could pick
// ANOTHER Chrome profile with `select_browser` and read pages there. A hook decision is applied
// before the permission function, in every mode, so the gate lives here.
//
// The project's profile is `browser.deviceId` in `<project>/.xenomoon/settings.json`, read through
// ui/lib/project-settings.js (the one reader of that file); the project is resolved from the
// payload's `cwd`, as project-policy.mjs does. `select_browser` passes (silent, exit 0) only with
// exactly that id. `switch_browser` (a click in Chrome picks the profile) is always refused.
// Page tools, clicks and typing are not this hook's business.
//
// Fail-CLOSED, unlike consequential-gate.mjs: these two calls choose whose browser the session
// reads, so an input or a settings file this hook cannot read is a refusal, never a silent allow.
import path from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SELECT_TOOL = "mcp__claude-in-chrome__select_browser";
export const SWITCH_TOOL = "mcp__claude-in-chrome__switch_browser";

const FIX =
  "Add the id of the project's Chrome profile to `.xenomoon/settings.json` as `browser.deviceId`.";
export const REASONS = Object.freeze({
  wrongProfile:
    "This is not the project's Chrome profile. Call select_browser with the id in `browser.deviceId` of `.xenomoon/settings.json`, the only profile this project may use.",
  notReady: `The Chrome profile setup is not ready: the project has no Chrome profile set. ${FIX}`,
  switchRefused:
    "switch_browser is refused: the project's Chrome profile is chosen by the project's setting, not by a click. Call select_browser with the id in `browser.deviceId` of `.xenomoon/settings.json`.",
  unreadable: `The Chrome profile gate could not read the hook input or the project's settings, so the call is refused. Check that the session runs inside the project and that \`.xenomoon/settings.json\` is valid JSON. ${FIX}`,
});

/**
 * The decision for one Chrome profile call. Pure.
 * @param {{ deviceId?: unknown } | null | undefined} browser the project's `browser` settings
 * @param {{ tool_name?: unknown, tool_input?: unknown }} call the hook payload's tool call
 * @returns {{ verdict: "pass" } | { verdict: "deny", reason: string }}
 */
export function chromeProfileDecision(browser, call) {
  if (call.tool_name === SWITCH_TOOL) return { verdict: "deny", reason: REASONS.switchRefused };
  if (call.tool_name !== SELECT_TOOL) return { verdict: "pass" };
  const own = browser && typeof browser.deviceId === "string" ? browser.deviceId : "";
  if (!own) return { verdict: "deny", reason: REASONS.notReady };
  const input = /** @type {{ deviceId?: unknown } | null} */ (
    call.tool_input && typeof call.tool_input === "object" ? call.tool_input : null
  );
  return input?.deviceId === own
    ? { verdict: "pass" }
    : { verdict: "deny", reason: REASONS.wrongProfile };
}

/** @param {string} reason */
function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

/** The project's `browser` settings for the session's folder. No project → no setting. Throws when
 * the framework's settings reader cannot be loaded. @param {unknown} cwd
 * @returns {Promise<{ deviceId: string }>} */
async function projectBrowser(cwd) {
  const { FRAMEWORK_DIR } = await import("./project-policy.mjs");
  const mod = await import(path.join(FRAMEWORK_DIR, "ui", "lib", "project-settings.js"));
  if (typeof mod.resolveProjectDir !== "function" || typeof mod.readBrowserSettings !== "function")
    throw new Error("ui/lib/project-settings.js is missing an export (version-skewed install)");
  const projectDir =
    typeof cwd === "string" && !cwd.includes("\0") ? mod.resolveProjectDir(cwd) : "";
  return projectDir ? mod.readBrowserSettings(projectDir) : { deviceId: "" };
}

/** @param {string} input the raw stdin */
async function run(input) {
  /** @type {{ tool_name?: unknown, tool_input?: unknown, cwd?: unknown }} */
  let payload;
  try {
    payload = JSON.parse(input);
    if (!payload || typeof payload !== "object") throw new Error("not an object");
  } catch {
    deny(REASONS.unreadable);
    return;
  }
  /** @type {{ deviceId: string } | null} */
  let browser = null;
  if (payload.tool_name === SELECT_TOOL) {
    try {
      browser = await projectBrowser(payload.cwd);
    } catch {
      deny(REASONS.unreadable);
      return;
    }
  }
  const d = chromeProfileDecision(browser, payload);
  if (d.verdict === "deny") deny(d.reason);
  process.exit(0);
}

/** @returns {boolean} */
function runAsCli() {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (runAsCli()) {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (input += c));
  process.stdin.on("end", () => void run(input).catch(() => deny(REASONS.unreadable)));
}
