// Which in-process MCP tools are "UI-control" surfaces — they only mutate local state +
// broadcast to the browser (no real side effect), so canUseTool auto-allows them without
// the permission gate. Split out of session.js to keep makeCanUseTool's complexity (and
// that file's length) in check.
import { TASK_TOOL, ASK_TOOL, PROMOTE_TOOL, AUTONOMOUS_TOOL } from "./config.js";

// These get the calling agent stamped as `_by` so the server can attribute the record
// (task/question/promotion owner). The server overrides any model-supplied `_by`.
const STAMP_BY_TOOLS = new Set([TASK_TOOL, ASK_TOOL, PROMOTE_TOOL]);
// These auto-allow with no stamp.
const PLAIN_ALLOW_TOOLS = new Set([AUTONOMOUS_TOOL]);

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
  "Image reads are GATED (a render/screenshot frame is token-heavy base64). Framework rule (godot-verify): never read a frame into chat — trust the NUMERIC gate (render_health.gd / VERIFY-* output). The PNG stays on disk (.godot/verify_render_last.png) for human inspection only. If a human genuinely must eyeball it, surface that via AskUserQuestion at the END of the pipeline.";

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

/** Deterministic pre-gates run BEFORE the permission policy: the screenshot read gate. Returns
 * a decision to short-circuit, or null to fall through. Keeps makeCanUseTool's arrow under the
 * complexity cap and its file under the line cap.
 * @param {GateDeps} d */
export async function preToolGate({ session, waitFor, log, toolName, input, agent }) {
  if (isImageRead(toolName, input))
    return gateImageRead({ session, waitFor, log, toolName, input, agent });
  return null;
}
