// Shared gate for the two question tools (mcp__ui__ask, mcp__ui__form): a question that names an
// issue is refused while that issue is not at an owner stop. One place gates, logs the refusal and
// builds the error result, so both tools refuse the same way.
import { readTasks } from "../features/tasks/tasks-store.js";
import { questionGate } from "../features/tasks/flow-task.js";
import { canonicalIssue } from "../features/tasks/flow-machine.js";

/**
 * Gate a question on its issue. Allowed → `undefined` (the caller goes on as before). Refused →
 * one "question-refused" log line and the tool's error result carrying the gate's message.
 * @param {{
 *   issue: string | number | undefined,
 *   toolName: "mcp__ui__ask" | "mcp__ui__form",
 *   agent: string,
 *   question: string,
 *   log: import("../core/connection.js").LiveSession["log"],
 * }} q
 * @returns {{ content: { type: "text", text: string }[], isError: true } | undefined}
 */
export function refuseQuestion({ issue, toolName, agent, question, log }) {
  const gate = questionGate(readTasks(), issue);
  if (gate.ok) return undefined;
  log("auto", {
    type: "question-refused",
    toolName,
    agent,
    // A value that is not a number is logged bounded: its first 40 characters, nothing more.
    issue: canonicalIssue(issue) ?? String(issue).slice(0, 40),
    ...(gate.at ? { at: gate.at } : {}),
    question: String(question ?? "").slice(0, 300),
  });
  return { content: [{ type: "text", text: gate.message }], isError: true };
}
