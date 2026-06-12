// Server configuration — argv parsing, paths and policy constants, resolved
// once at startup. Importing this module also validates --allow and exits on a
// bad value (a load-time side effect, by design).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** The ui/ directory (this file lives in ui/server/). */
export const UI_DIR = path.join(__dirname, "..");

const args = process.argv.slice(2);
export const PROJECT_DIR = path.resolve(args.find((a) => !a.startsWith("--")) ?? ".");
export const PORT = Number(process.env.PORT ?? 3117);

// Default permission policy for new sessions: ask | edits | all.
// Override per session from the UI header. AskUserQuestion always prompts.
export const POLICIES = ["ask", "edits", "all"];
export const DEFAULT_POLICY = args.find((a) => a.startsWith("--allow="))?.split("=")[1] ?? "ask";
if (!POLICIES.includes(DEFAULT_POLICY)) {
  console.error(`--allow must be one of: ${POLICIES.join(", ")}`);
  process.exit(1);
}
export const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

// In-process MCP tool the main agent calls to put a typed form in front of the
// user (see makeFormTool). Like AskUserQuestion, the form IS the user
// interaction, so it bypasses the permission policy.
export const FORM_TOOL = "mcp__ui__form";

// The main loop is an orchestrator: pinned model (not the user's default) and a
// routing-focused system prompt, editable in ui/orchestrator.md.
export const MODEL =
  args.find((a) => a.startsWith("--model="))?.split("=")[1] ?? "claude-sonnet-4-6";
export const ORCHESTRATOR_PROMPT = readFileSync(path.join(UI_DIR, "orchestrator.md"), "utf8");

// Claude Code's own transcript store for this project — every session here is
// listed and resumable, terminal ones included.
export const TRANSCRIPT_DIR = path.join(
  homedir(),
  ".claude",
  "projects",
  PROJECT_DIR.replace(/[/.]/g, "-"),
);

export const LOG_DIR = path.join(UI_DIR, "..", "logs");
