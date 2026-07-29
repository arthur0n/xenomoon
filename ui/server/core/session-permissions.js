// The session's permission layer, extracted from session.js (line cap): the canUseTool
// approver plus the inline-ask gates. Pure functions over explicit dependencies — the
// per-connection mutable state (session, sessionAllowed, pending) stays in session.js.
import { uiControlAllow, preToolGate } from "./ui-control.js";
import { findOpenQuestion } from "../features/tasks/tasks-store.js";
import { EDIT_TOOLS, FORM_TOOL } from "./config.js";

/** @typedef {import("../../lib/types.js").OutMsg} OutMsg */
/** @typedef {import("../../lib/types.js").WaitFor} WaitFor */
/** @typedef {import("./session.js").SessionState} SessionState */

/** One-channel guard for inline asks: if any question in an `AskUserQuestion` call
 * matches an already-open board question (filed via `mcp__ui__ask`), return a deny
 * result pointing at it; else null. Stops a second, divergent record (t224/t140).
 * @param {unknown} input @returns {{ behavior: "deny", message: string } | null} */
function denyIfQuestionOpen(input) {
  if (!input || typeof input !== "object") return null;
  const raw = /** @type {{ questions?: unknown }} */ (input).questions;
  const questions = /** @type {Array<{ question?: unknown }>} */ (Array.isArray(raw) ? raw : []);
  for (const q of questions) {
    const text = q && typeof q.question === "string" ? q.question : "";
    const open = text ? findOpenQuestion(text) : undefined;
    if (open) {
      return {
        behavior: /** @type {const} */ ("deny"),
        message:
          `A question on this decision is already open on the board (${open.id}: "${open.title}"). ` +
          "Don't ask inline — its answer will arrive as a turn. Wait for it, or act on your best judgment.",
      };
    }
  }
  return null;
}

/** Handle an inline `AskUserQuestion`: deny it when the decision is already open on
 * the board (one-channel guard), otherwise pause for the user's pick. Extracted so
 * makeCanUseTool's arrow stays under the complexity cap. @param {unknown} input
 * @param {string} agent @param {WaitFor} waitFor */
async function handleAskQuestion(input, agent, waitFor) {
  const denied = denyIfQuestionOpen(input);
  if (denied) return denied;
  const answers = await waitFor("ask", { input, agent });
  const base = /** @type {Record<string, unknown>} */ (input);
  return { behavior: /** @type {const} */ ("allow"), updatedInput: { ...base, ...answers } };
}

/**
 * @param {{ session: SessionState, sessionAllowed: Set<string>, waitFor: WaitFor, log: (dir: string, obj: OutMsg) => void, agentByTool: Map<string, string>, formAgentQueue: string[] }} deps
 * @returns {import("@anthropic-ai/claude-agent-sdk").CanUseTool}
 */
export function makeCanUseTool({
  session,
  sessionAllowed,
  waitFor,
  log,
  agentByTool,
  formAgentQueue,
}) {
  return async (toolName, input, opts) => {
    // Which agent raised this call (main loop or a sub-agent), so the UI can
    // label concurrent approvals. opts.toolUseID is set by the SDK.
    const agent = agentByTool.get(opts.toolUseID) ?? "main";
    // Deterministic pre-gates that short-circuit BEFORE the permission policy: immutable-docs dedup
    // + the screenshot/render-frame read gate (both token-heavy; godot-verify "never read a frame").
    const pre = await preToolGate({ session, waitFor, log, toolName, input, agent });
    if (pre) return pre;
    if (toolName === "AskUserQuestion") return handleAskQuestion(input, agent, waitFor);
    if (toolName === FORM_TOOL) {
      // The tool handler does the waiting; hand it this call's agent (FIFO,
      // since canUseTool and the handler run 1:1 and order-aligned per tool).
      // Forms come only from FOREGROUND interview agents — backgrounded
      // (autonomous) Xenomoons never call mcp__ui__form (orchestrator rule), so
      // no two forms overlap and the FIFO stays 1:1 even with a worker in flight.
      formAgentQueue.push(agent);
      return { behavior: "allow", updatedInput: input };
    }
    // UI-control tools (tasks/ask/promote/asset/autonomous): auto-allow, never pause.
    const uiAllow = uiControlAllow(toolName, input, agent);
    if (uiAllow) return uiAllow;
    if (session.autonomousActive) {
      // hive self-drives — auto-allow all tools
      log("auto", { type: "permission", toolName, policy: "autonomous" });
      return { behavior: "allow", updatedInput: input };
    }
    if (
      session.policy === "all" ||
      (session.policy === "edits" && EDIT_TOOLS.has(toolName)) ||
      sessionAllowed.has(toolName)
    ) {
      log("auto", { type: "permission", toolName, policy: session.policy });
      return { behavior: "allow", updatedInput: input };
    }
    const { allow, always } = await waitFor("permission", { toolName, input, agent });
    if (allow && always) sessionAllowed.add(toolName);
    return allow
      ? { behavior: "allow", updatedInput: input }
      : { behavior: "deny", message: "Denied from the web UI" };
  };
}
