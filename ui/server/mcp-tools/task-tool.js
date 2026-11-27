// Tasks tool: the orchestrator's control surface over its persistent to-do
// list (see tasks-store.js). Unlike mcp__ui__form, it does NOT pause the
// session — it mutates the store, broadcasts the new list to the browser, and
// returns immediately. Tasks can be owned by the agent or handed to the user.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { applyTaskOp, closeOpenAgentTasks, summarize } from "../features/tasks/tasks-store.js";
import { DONE, FIX_LIMIT, FLOW_IDS, TRIAGE_LIMIT } from "../features/tasks/flow-machine.js";

/** The ids op "flow" accepts in `to`, from the flow machine (never retyped). */
const FLOW_TO = /** @type {[string, ...string[]]} */ ([...FLOW_IDS]);

const TASK_SPEC = z.object({
  title: z.string().describe("Short, discrete task title"),
  owner: z.enum(["agent", "user"]).optional().describe('Who must do it (default "agent")'),
  note: z.string().optional().describe("Optional one-line detail"),
});

/** @param {(obj: import("../../lib/types.js").OutMsg) => void} send */
export function makeTaskTool(send) {
  return tool(
    "tasks",
    "Manage your persistent task list — the to-do board shown in the UI's right rail and " +
      "stored at .xenomoon/tasks.json. Use it to track your own multi-step work " +
      '(owner "agent") and to hand explicit to-dos to the user (owner "user"). It does ' +
      "NOT pause the session. Keep tasks small and discrete. Every result lists the tasks " +
      "still OPEN, so you can always see what's unfinished. Before you hand off or end " +
      'your run, call op "complete_open" once to close all your own open tasks. ' +
      'op "objective" pins the human\'s standing ask for the session (title = their words, ' +
      "verbatim); every result echoes it first — read it before each dispatch, and close it " +
      'with status "done" only when it is met. ' +
      'op "flow" moves ONE issue through the flow: {op:"flow", issue:84, to:"design"} — one call ' +
      "per step change (the first call may omit `to`: Screening, or name a later step to place it " +
      "there). No title or status: the tool keeps the step and counts the two budgets itself " +
      `(triage ${TRIAGE_LIMIT}, fix ${FIX_LIMIT}; over one, the issue is parked in a waiting state). ` +
      "It refuses a move the flow does not have and names the allowed ones; every result starts " +
      "with where the issue is and its allowed next moves. One task per issue; it survives " +
      `complete_open and every other close, and only to "${DONE}" (from proof) closes it.`,
    {
      op: z
        .enum(["add", "update", "remove", "complete_open", "objective", "flow"])
        .describe(
          'Mutation to apply. "complete_open" marks ALL your own open tasks done at once. ' +
            '"objective" sets/replaces the session objective (title), or closes it (status "done"). ' +
            '"flow" moves one issue to the step or state named in `to`.',
        ),
      // add
      title: z
        .string()
        .optional()
        .describe(
          "add: the task title (or use `tasks` for a batch); objective: the ask, verbatim; " +
            "not for flow (refused)",
        ),
      owner: z.enum(["agent", "user"]).optional().describe('add/update: owner (default "agent")'),
      note: z.string().optional().describe("add/update: optional one-line detail"),
      tasks: z.array(TASK_SPEC).optional().describe("add: several tasks at once"),
      // update / remove
      id: z.string().optional().describe("update/remove: target task id (e.g. t3)"),
      status: z
        .enum(["pending", "in_progress", "done"])
        .optional()
        .describe('update: new status; objective: "done" closes it; not for flow (refused)'),
      // flow
      issue: z
        .union([z.number(), z.string()])
        .optional()
        .describe('flow: the issue number (84 or "84")'),
      to: z
        .enum(FLOW_TO)
        .optional()
        .describe(
          "flow: the step or waiting state to move to (optional on the first call = screening)",
        ),
      // Internal: the creating agent, set by the server (canUseTool) — do not set it yourself.
      _by: z.string().optional().describe("internal — server-set; ignore"),
    },
    async (input) => {
      // canUseTool stamps `_by` for foreground callers; a backgrounded sub-agent is
      // granted by the allow-subagent-ui-control hook (which bypasses canUseTool), so
      // `_by` is absent here — attribute it to "background" (the bridge's own label).
      const by = input._by ?? "background";
      const { list, error, info } =
        input.op === "complete_open"
          ? { list: closeOpenAgentTasks(by), error: undefined, info: undefined }
          : applyTaskOp({ ...input, _by: by }, new Date().toISOString());
      send({ type: "tasks", tasks: list });
      // A refusal is reported first, then op "flow"'s status line, then the board.
      const text = [error, info, summarize(list)].filter(Boolean).join("\n");
      return { content: [{ type: "text", text }] };
    },
  );
}
