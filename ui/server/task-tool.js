// Tasks tool: the orchestrator's control surface over its persistent to-do
// list (see tasks-store.js). Unlike mcp__ui__form, it does NOT pause the
// session — it mutates the store, broadcasts the new list to the browser, and
// returns immediately. Tasks can be owned by the agent or handed to the user.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { applyOp, summarize } from "./tasks-store.js";

const TASK_SPEC = z.object({
  title: z.string().describe("Short, discrete task title"),
  owner: z.enum(["agent", "user"]).optional().describe('Who must do it (default "agent")'),
  note: z.string().optional().describe("Optional one-line detail"),
});

/** @param {(obj: import("../lib/types.js").OutMsg) => void} send */
export function makeTaskTool(send) {
  return tool(
    "tasks",
    "Manage your persistent task list — the to-do board shown in the UI's right rail and " +
      "stored at .xenodot/tasks.json. Use it to track your own multi-step work " +
      '(owner "agent") and to hand explicit to-dos to the user (owner "user"). It does ' +
      "NOT pause the session. Keep tasks small and discrete; the JSON file is the source " +
      "of truth you can read directly.",
    {
      op: z.enum(["add", "update", "remove"]).describe("Mutation to apply"),
      // add
      title: z.string().optional().describe("add: the task title (or use `tasks` for a batch)"),
      owner: z.enum(["agent", "user"]).optional().describe('add/update: owner (default "agent")'),
      note: z.string().optional().describe("add/update: optional one-line detail"),
      tasks: z.array(TASK_SPEC).optional().describe("add: several tasks at once"),
      // update / remove
      id: z.string().optional().describe("update/remove: target task id (e.g. t3)"),
      status: z.enum(["pending", "in_progress", "done"]).optional().describe("update: new status"),
    },
    async (input) => {
      const list = applyOp(input, new Date().toISOString());
      send({ type: "tasks", tasks: list });
      return { content: [{ type: "text", text: summarize(list) }] };
    },
  );
}
