// First-boot onboarding kickoff — one-shot. The install leaves `onboarded:false` in
// .xenomoon.json; the first session to connect (when the bound project already has a Claude
// life) gets ONE injected turn telling the orchestrator to run /onboard — the UI session has
// the plugins loaded, so the command exists there with full tooling (forms + the promotions
// board). The flag flips immediately (kickoff fires once); /onboard stays manually
// re-runnable any time.
import { existsSync } from "node:fs";
import path from "node:path";
import { PROJECT_DIR, getOnboarded, markOnboarded } from "./config.js";

/** @typedef {import("@anthropic-ai/claude-agent-sdk").SDKUserMessage} SDKUserMessage */

/** Push the /onboard kickoff turn when this is the first boot of an existing-Claude project.
 * @param {(msg: SDKUserMessage) => void} push */
export function maybeKickoffOnboarding(push) {
  if (getOnboarded()) return;
  const hasClaudeLife =
    existsSync(path.join(PROJECT_DIR, "CLAUDE.md")) ||
    existsSync(path.join(PROJECT_DIR, ".claude"));
  if (!hasClaudeLife) return;
  markOnboarded(); // one-shot — a failed run is re-launched manually with /onboard
  push({
    type: "user",
    parent_tool_use_id: null,
    message: {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "[First boot] This install just bound a project that already uses Claude. " +
            "Run /onboard now — inventory its CLAUDE.md and .claude/skills, report hook " +
            "conflicts, map its commands, and hand the merge proposal + business-rules " +
            "interview to the designer. Every write is human-gated. When it finishes, " +
            "tell the user to START A NEW SESSION so the results load.",
        },
      ],
    },
  });
}
