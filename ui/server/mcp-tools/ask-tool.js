// Ask tool: an ASYNC human-gate for background workers. Unlike mcp__ui__form
// (which pauses the session until the browser replies — impossible for a
// fire-and-forget background sub-agent, whose tool calls have no interactive
// approver), this files the question onto the persistent board as an
// owner:"user" item and returns IMMEDIATELY. The user answers it inline in the
// UI; the orchestrator reads the answer on a later turn and relays/acts on it.
// Use it from a backgrounded agent that hits a human decision; foreground agents
// should still use mcp__ui__form (a real, blocking form) instead.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { addQuestion } from "../features/tasks/tasks-store.js";

/** @param {(obj: import("../../lib/types.js").OutMsg) => void} send */
export function makeAskTool(send) {
  return tool(
    "ask",
    "The BACKGROUND counterpart to mcp__ui__form. Ask the user a question WITHOUT blocking — " +
      "files it onto the task board (the task panel) for " +
      "them to answer asynchronously, and returns immediately. Use this from " +
      "background/autonomous/headless work where you can't pause for a reply; the orchestrator " +
      "relays the answer on a later turn. Do NOT wait on it — file the question, then " +
      "continue with your best judgment or wrap up. (Foreground agents that can pause " +
      "should use mcp__ui__form instead.)",
    {
      question: z.string().describe("The single question to put to the user."),
      // Ask-shape contract (D9): three bands — human GATES (commit/ship/promote/scope)
      // must ask; PROCEDURE (how to run something, which of two equivalent paths) must
      // NOT ask — pick the default and proceed; the judgment middle asks ONLY with a
      // recommendation. An ask with no recommendation is a hedge, not a question.
      recommendation: z
        .string()
        .describe(
          "REQUIRED: your recommended answer + the one-line why. Decide first, then ask to confirm — " +
            "never offload an open decision. If you cannot form a recommendation, you are missing " +
            "context an agent should go get instead.",
        ),
      defaultAction: z
        .string()
        .optional()
        .describe(
          "What you proceed with if no answer arrives (this tool is non-blocking — state the path you take meanwhile).",
        ),
      options: z
        .array(z.string())
        .optional()
        .describe("Optional suggested answers the user can pick with one click."),
      // Internal: the creating agent, set by the server (canUseTool) — do not set it yourself.
      _by: z.string().optional().describe("internal — server-set; ignore"),
    },
    async (input) => {
      // canUseTool stamps `_by` for foreground callers; a backgrounded sub-agent is
      // granted by the allow-subagent-ui-control hook (which bypasses canUseTool), so
      // `_by` is absent here — attribute it to "background" (the bridge's own label).
      const text =
        input.question +
        `\n→ recommend: ${input.recommendation}` +
        (input.defaultAction ? ` (proceeding with: ${input.defaultAction})` : "");
      const list = addQuestion(
        text,
        input.options,
        input._by ?? "background",
        new Date().toISOString(),
      );
      send({ type: "tasks", tasks: list });
      return {
        content: [
          {
            type: "text",
            text:
              "Question filed to the board for the user to answer asynchronously. " +
              "Do not wait — continue or wrap up; the orchestrator will relay the answer later.",
          },
        ],
      };
    },
  );
}
