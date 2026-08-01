// Which in-process MCP tools are "UI-control" surfaces — they only mutate local state +
// broadcast to the browser (no real side effect), so canUseTool auto-allows them without
// the permission gate. Split out of session.js to keep makeCanUseTool's complexity (and
// that file's length) in check.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  TASK_TOOL,
  ASK_TOOL,
  PROMOTE_TOOL,
  AUTONOMOUS_TOOL,
  EPIC_TOOL,
  EDIT_TOOLS,
  GENERIC_SUBAGENT_TYPES,
  FRAMEWORK_PLUGIN_DIR,
} from "./config.js";

// These get the calling agent stamped as `_by` so the server can attribute the record
// (task/question/promotion owner). The server overrides any model-supplied `_by`.
const STAMP_BY_TOOLS = new Set([TASK_TOOL, ASK_TOOL, PROMOTE_TOOL]);
// These auto-allow with no stamp. EPIC_TOOL writes the project's tracker, but it is the
// contract surface for that exact write (template-shaped, deterministic) — gating it would
// push agents back to freehand `gh` through Bash.
const PLAIN_ALLOW_TOOLS = new Set([AUTONOMOUS_TOOL, EPIC_TOOL]);

/** Auto-allow result for a UI-control tool, or null if `toolName` isn't one.
 * @param {string} toolName @param {Record<string, unknown>} input @param {string} agent */
export function uiControlAllow(toolName, input, agent) {
  if (STAMP_BY_TOOLS.has(toolName))
    return { behavior: /** @type {const} */ ("allow"), updatedInput: { ...input, _by: agent } };
  if (PLAIN_ALLOW_TOOLS.has(toolName))
    return { behavior: /** @type {const} */ ("allow"), updatedInput: input };
  return null;
}

const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;

/** The stub returned when an image Read is refused — points at the numeric gate + disk frame. */
export const SCREENSHOT_STUB =
  "Image reads are GATED (a render/screenshot frame is token-heavy base64). Framework rule: never read a frame into chat — trust the NUMERIC/deterministic gate output instead. The image stays on disk for human inspection only. If a human genuinely must eyeball it, surface that via AskUserQuestion at the END of the pipeline.";

/** Is this a Read of an image file (a screenshot/render frame)? Such a Read floods context with
 * ~thousands of base64 tokens, so it is gated (human-approved / denied when headless), never at-will.
 * @param {string} toolName @param {unknown} input @returns {boolean} */
export function isImageRead(toolName, input) {
  if (toolName !== "Read") return false;
  const fp = /** @type {{ file_path?: unknown }} */ (input)?.file_path;
  return typeof fp === "string" && IMAGE_RE.test(fp);
}

/** @typedef {import("../../lib/types.js").WaitFor} WaitFor */
/** @typedef {import("../../lib/types.js").OutMsg} OutMsg */
/** @typedef {{ session: { autonomousActive?: boolean }, waitFor: WaitFor, log: (dir: string, obj: OutMsg) => void, toolName: string, input: Record<string, unknown>, agent: string }} GateDeps */

/** Gate a screenshot/render-frame Read: deny outright when headless/autonomous (no human to
 * approve), else FORCE a human approval — never at-will. @param {GateDeps} d */
async function gateImageRead({ session, waitFor, log, toolName, input, agent }) {
  if (session.autonomousActive) {
    log("auto", { type: "permission", toolName, policy: "image-read-denied" });
    return { behavior: /** @type {const} */ ("deny"), message: SCREENSHOT_STUB };
  }
  const { allow } = await waitFor("permission", { toolName, input, agent });
  return allow
    ? { behavior: /** @type {const} */ ("allow"), updatedInput: input }
    : { behavior: /** @type {const} */ ("deny"), message: SCREENSHOT_STUB };
}

// ── Orchestrator gates (D9-priors-beat-prose) ────────────────────────────────
// The main loop routes; it never implements. These denials are MECHANICAL — the
// instruction layer kept losing to the model's generic priors, so the affordance
// is removed instead of pleaded with. Sub-agents (agent !== "main") pass through.

/** The installed agent roster (plugin/agents/*.md basenames), cached per process.
 * @returns {string[]} */
let _roster = /** @type {string[] | null} */ (null);
function pipelineRoster() {
  if (_roster) return _roster;
  try {
    _roster = readdirSync(join(FRAMEWORK_PLUGIN_DIR, "agents"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3));
  } catch {
    _roster = [];
  }
  return _roster;
}

const GH_ISSUE_RE = /(^|&&|\|\||;|\|)\s*(rtk\s+)?gh\s+issue\b/;
// State-mutating git subcommands. Read verbs (status/log/diff/show/fetch/branch-list/
// worktree-list/rev-parse/ls-files) stay allowed — the orchestrator routes on them.
const GIT_MUTATE_RE =
  /(^|&&|\|\||;|\|)\s*(rtk\s+)?git\s+(-C\s+\S+\s+)?(add|commit|stash|rebase|merge|reset|push|pull|cherry-pick|revert|am|apply|restore|switch|checkout|rm|mv|clean|tag)\b/;

// The domain pack's own deterministic commit gate (webapp: commit-gate.sh re-derives
// qa/review labels at commit time and denies non-green). When the INSTALLED plugin ships
// it, the pipeline's /commit stage is the orchestrator's sanctioned direct git write —
// add/commit only; everything else stays denied. No hook installed → no carve-out.
let _commitGateHook = /** @type {boolean | null} */ (null);
function hasCommitGateHook() {
  _commitGateHook ??= existsSync(join(FRAMEWORK_PLUGIN_DIR, "hooks", "commit-gate.sh"));
  return _commitGateHook;
}
const GIT_ADD_COMMIT_ONLY_RE =
  /^(\s*(rtk\s+)?git\s+(-C\s+\S+\s+)?(add|commit)\b[^&|;]*)(&&\s*(rtk\s+)?git\s+(-C\s+\S+\s+)?(add|commit)\b[^&|;]*)*$/;

/** Deny message for a main-loop Bash command that bypasses the framework, or null.
 * Live bite (2026-08-01): the Hive hand-cranked `git commit` on the USER's working tree
 * to unblock a rebase — exactly the class the worktree-isolated developer owns.
 * @param {Record<string, unknown>} input @returns {string | null} */
function mainBashDenyMessage(input) {
  const cmd = /** @type {{ command?: unknown }} */ (input)?.command;
  if (typeof cmd !== "string") return null;
  if (hasCommitGateHook() && GIT_ADD_COMMIT_ONLY_RE.test(cmd.trim())) return null;
  if (GH_ISSUE_RE.test(cmd))
    return (
      "Raw `gh issue` is denied for the orchestrator — the issue tracker is owned by " +
      "issuekit (the /issue skill): `issuekit search|new|attempt|resolve`. " +
      "If the repo lacks .issuekit.json, run `issuekit init` once first."
    );
  if (GIT_MUTATE_RE.test(cmd))
    return (
      "Orchestrator never touches the working tree — mutating git is denied for the main " +
      "loop (read verbs like status/log/diff stay open). Dispatch the developer agent; for " +
      "rebases/conflicts have it work in an ISOLATED git worktree so the user's uncommitted " +
      "changes are never staged, stashed, or parked. Commits land via the pipeline's commit stage."
    );
  return null;
}

/** Sole edit carve-out for the main loop: the debrief signal log. The orchestrator's own
 * contract says the append is "deterministic, same turn, never skipped" (webapp
 * orchestrator.md) — a bookkeeping line, not implementation. Everything else delegates.
 * @param {Record<string, unknown>} input */
function isQueueAppend(input) {
  const fp = /** @type {{ file_path?: unknown }} */ (input)?.file_path;
  return typeof fp === "string" && fp.endsWith(".xenomoon/debrief-queue.md");
}

/** Deny main-loop calls that bypass the framework: direct edits (delegate instead),
 * generic subagents (the roster owns the work), raw `gh issue` (issuekit owns issues).
 * Returns a deny decision or null. @param {GateDeps} d */
function orchestratorGate({ log, toolName, input, agent }) {
  if (agent !== "main") return null;
  const deny = (/** @type {string} */ message) => {
    log("auto", { type: "permission", toolName, policy: "orchestrator-gate" });
    return { behavior: /** @type {const} */ ("deny"), message };
  };
  if (EDIT_TOOLS.has(toolName) && !isQueueAppend(input)) {
    return deny(
      `Orchestrator never implements — main-loop ${toolName} is denied by the session. ` +
        `Dispatch the owning agent (installed roster: ${pipelineRoster().join(", ") || "see plugin/agents/"}) ` +
        "and let it make the change in its own context.",
    );
  }
  if (toolName === "Task") {
    const type = /** @type {{ subagent_type?: unknown }} */ (input)?.subagent_type;
    if (typeof type === "string" && GENERIC_SUBAGENT_TYPES.has(type) && pipelineRoster().length) {
      return deny(
        `Generic agent "${type}" is denied — the installed roster owns this work ` +
          `(${pipelineRoster().join(", ")}). Dispatch the matching agent; discovery belongs ` +
          "to the owning agent, not a pre-dispatch scout.",
      );
    }
  }
  if (toolName === "Bash") {
    const message = mainBashDenyMessage(input);
    if (message) return deny(message);
  }
  return null;
}

/** Deterministic pre-gates run BEFORE the permission policy: the orchestrator role gate
 * (main loop never implements / never goes generic / never freehands the tracker) and the
 * screenshot read gate. Returns a decision to short-circuit, or null to fall through.
 * Keeps makeCanUseTool's arrow under the complexity cap and its file under the line cap.
 * @param {GateDeps} d */
export async function preToolGate({ session, waitFor, log, toolName, input, agent }) {
  const role = orchestratorGate({ session, waitFor, log, toolName, input, agent });
  if (role) return role;
  if (isImageRead(toolName, input))
    return gateImageRead({ session, waitFor, log, toolName, input, agent });
  return null;
}
