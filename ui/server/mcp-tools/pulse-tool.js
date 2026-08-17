// mcp__ui__pulse — the Hive's read/nudge handle on the ambient landing sweep.
//
// Deliberately NARROW. Pulse is a fallback that works whether or not the Hive thinks about it, so
// this tool cannot make it do more: there is no "run these extra checks" op and no way to add a
// check at runtime. `propose_check` files a QUESTION for the human instead — a new check is a
// human-approved change to the code, which is what keeps Pulse from quietly growing its own
// surface area and becoming a second Autonomous Mode.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { readPulse, armPulse, disarmPulse } from "../features/pulse/pulse-store.js";
import { beatNow, publish } from "../features/pulse/pulse-control.js";
import { addQuestion } from "../features/tasks/tasks-store.js";

/** @typedef {import("../../lib/types.js").OutMsg} OutMsg */

/** A tool text result. @param {string} text */
const ok = (text) => ({ content: [{ type: /** @type {const} */ ("text"), text }] });

/** @param {import("../../lib/types.js").Pulse} p @returns {string} */
function summarize(p) {
  const state = !p.active ? "off" : p.sleeping ? "sleeping" : "armed";
  return (
    `pulse ${state} · beats ${p.beats} · last found ${p.found} (${p.suppressed} unchanged) · ` +
    `flat ${p.flatBeats} · scope ${p.scope}` +
    (p.nextBeatAt ? ` · next ${p.nextBeatAt}` : "") +
    (p.lastError ? ` · last error: ${p.lastError}` : "")
  );
}

/** @param {(o: OutMsg) => void} send */
export function makePulseTool(send) {
  return tool(
    "pulse",
    "Read or nudge Pulse, the ambient landing sweep that reports work which finished but never " +
      "landed (unpushed branches, idle PRs, issues waiting on the human). " +
      'op:"status" reads it · op:"now" forces one beat · op:"arm"/"disarm" toggles it · ' +
      'op:"propose_check" files a question asking the human to approve a NEW check (you cannot ' +
      "add one yourself — that is deliberate).",
    {
      op: z.enum(["status", "now", "arm", "disarm", "propose_check"]),
      proposal: z
        .string()
        .optional()
        .describe('propose_check only: the check to add, e.g. "flag release tags never pushed"'),
    },
    async (input) => {
      const now = new Date().toISOString();
      if (input.op === "status") return ok(summarize(readPulse()));

      if (input.op === "arm") {
        const state = armPulse(now);
        publish();
        void beatNow(); // arming runs a sweep immediately — the "opens the session" behaviour
        return ok(`armed. ${summarize(state)}`);
      }

      if (input.op === "disarm") {
        const state = disarmPulse(now);
        publish();
        return ok(`disarmed. ${summarize(state)}`);
      }

      if (input.op === "now") {
        await beatNow();
        return ok(summarize(readPulse()));
      }

      const proposal = (input.proposal ?? "").trim();
      if (!proposal) return ok("propose_check needs a `proposal` describing the check.");
      // addQuestion coalesces on the normalized title, so proposing the same check twice does not
      // stack a second card on the board.
      const list = addQuestion(
        `Add a Pulse check: ${proposal}`,
        ["approve", "reject"],
        "main",
        now,
      );
      send({ type: "tasks", tasks: list });
      return ok(`filed for the human: "${proposal}". A check lands only once they approve it.`);
    },
  );
}
