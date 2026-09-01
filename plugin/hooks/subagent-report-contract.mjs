#!/usr/bin/env node
/* global process */
// SubagentStop contract gate: a worker that wrote a handoff file must relay ONLY
// `<path> — gate PASS|FAIL` (agent-report/SKILL.md — "the handoff is a FILE, not your result
// string"). The contract existed as prose since 2026-07 and was measured ignored (~1.2k-char
// avg prose results vs the ~50-char form) — mechanism over prose, same doctrine as the Codex
// consent hook. Scope is deliberately NARROW: a sub-agent that wrote nothing under
// .xenomoon/handoffs/ is exempt, because a research/Explore answer is LEGITIMATELY prose and a
// blunt global regex would train ignore-the-block. Blocks AT MOST ONCE (stop_hook_active),
// then lets whatever came back through — this is a guardrail against drift, not a sandbox.
// FAIL-OPEN on any parse uncertainty: an unreadable transcript must never wedge a worker.
import { readFileSync } from "node:fs";

/** @param {unknown} v @returns {string} */
const text = (v) => (typeof v === "string" ? v : "");

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  /** @type {{ transcript_path?: string, stop_hook_active?: boolean }} */
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
  }
  // Already blocked once this stop — never loop a worker that cannot comply.
  if (payload.stop_hook_active) process.exit(0);
  const path = text(payload.transcript_path);
  if (!path) process.exit(0);

  let lines;
  try {
    lines = readFileSync(path, "utf8").split("\n");
  } catch {
    process.exit(0);
  }

  /** The handoff files this agent Wrote, and its final assistant text. Transcript entries are
   * JSONL; a sub-agent's own transcript holds its turns directly, and when the surface hands us
   * the parent transcript instead, the sidechain flag scopes us to the sub-agent's entries. */
  const handoffs = new Set();
  let lastAssistant = "";
  let sawSidechain = false;
  for (const line of lines) {
    if (!line) continue;
    /** @type {any} */
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.isSidechain === true) sawSidechain = true;
  }
  for (const line of lines) {
    if (!line) continue;
    /** @type {any} */
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (sawSidechain && e.isSidechain !== true) continue; // parent transcript → sub-agent entries only
    const msg = e.message;
    if (!msg || typeof msg !== "object") continue;
    const content = Array.isArray(msg.content) ? msg.content : [];
    if (e.type === "assistant" || msg.role === "assistant") {
      let t = "";
      for (const block of content) {
        if (block && block.type === "text") t += text(block.text);
        if (
          block &&
          block.type === "tool_use" &&
          (block.name === "Write" || block.name === "MultiEdit" || block.name === "Edit")
        ) {
          const fp = text(block.input?.file_path);
          if (/\.xenomoon\/handoffs\/[^/]+\.md$/.test(fp)) handoffs.add(fp);
        }
      }
      if (t.trim()) lastAssistant = t.trim();
    }
  }

  if (handoffs.size === 0) process.exit(0); // no handoff written → the contract does not apply

  // Compliant: short, names a written handoff path, carries the gate verdict. Tolerant on
  // punctuation (— or -, case), strict on shape — the WHOLE point is that the path + verdict
  // survive result clipping, so a 1.2k-char essay fails even when it contains both.
  const namesPath = [...handoffs].some((h) =>
    lastAssistant.includes(h.slice(h.indexOf(".xenomoon/"))),
  );
  const hasGate = /gate\s+(PASS|FAIL)/i.test(lastAssistant);
  const short = lastAssistant.length <= 300;
  if (namesPath && hasGate && short) process.exit(0);

  const want = [...handoffs][0];
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason:
        `agent-report contract: you wrote ${want} — your relayed result must be ONLY ` +
        "`<path> — gate PASS|FAIL` (one line; the file is the handoff, the orchestrator reads it). " +
        "Re-emit exactly that line, nothing else.",
    }),
  );
  process.exit(0);
});
