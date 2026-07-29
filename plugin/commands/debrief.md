---
description: Run a retrospective — dispatch the debrief agent on a bug, a friction report, a near-miss, or a human override; no arguments = drain the .xenomoon/debrief-queue.md signal log (human-gated)
argument-hint: "[empty = drain the queue | issue# | 'friction: <one line>' | 'override: <what the human overrode>']"
---

# /debrief — the learning loop

Dispatch the **`debrief`** agent (opus, foreground preferred) on ONE finished thing:

- **no arguments — drain the queue.** Read `.xenomoon/debrief-queue.md` (the signal log
  the orchestrator appends to the moment an override / near-miss / friction happens —
  the record that survives a forgotten offer). Hand ALL open entries to the debrief agent
  in one run; after its verdicts land, remove the drained lines (keep any it explicitly
  parked). Empty/absent queue → "nothing queued", a valid result.
- an issue whose fix landed (`/debrief 42`) — pass the issue number; debrief reconstructs the
  rest from the thread, the diff, and the involved skills;
- a friction report (`/debrief friction: developer improvised the retry pattern, no skill
covered it`);
- an evaluator divergence or near-miss (`/debrief override: human passed what /qa blocked
on #37`).

Debrief establishes the root cause, maps it against the layers
(`plugin/docs/process/updates-routing.md`), reaches ONE verdict (update project skill /
dispatch researcher / update docs / refine rubric / domain-framework finding / no change),
confirms via `mcp__ui__form`, and applies only what was approved — project surfaces only.

Notes:

- **Opt-in only.** After a fix lands or an override happens, OFFER a debrief — never
  auto-run it. "No change" is a successful outcome.
- Debrief may fire its own Hermes run for outside evidence; when its report carries a
  pending runId, close the loop (`mcp__ui__hermes_feedback`) once the findings are judged.
- A "dispatch researcher" verdict is yours to execute: dispatch the `researcher` with the
  mode debrief named.
- Backgrounded debrief returns proposals via `mcp__ui__ask` without writing; you land the
  approved edits foreground.
