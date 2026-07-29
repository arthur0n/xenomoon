---
description: Run a retrospective — dispatch the retro agent on a bug, a friction report, or a human override of a QA/review/UAT verdict; it root-causes and proposes what should learn (human-gated)
argument-hint: "[issue# | 'friction: <one line>' | 'override: <what the human overrode>']"
---

# /retro — the learning loop

Dispatch the **`retro`** agent (opus, foreground preferred) on ONE finished thing:

- an issue whose fix landed (`/retro 42`) — pass the issue number; retro reconstructs the
  rest from the thread, the diff, and the involved skills;
- a friction report (`/retro friction: developer improvised the retry pattern, no skill
covered it`);
- an evaluator divergence (`/retro override: human passed what /qa blocked on #37`).

Retro establishes the root cause, maps it against the layers
(`plugin/docs/process/updates-routing.md`), reaches ONE verdict (update project skill /
dispatch researcher / update docs / refine rubric / domain-framework finding / no change),
confirms via `mcp__ui__form`, and applies only what was approved — project surfaces only.

Notes:

- **Opt-in only.** After a fix lands or an override happens, OFFER a retro — never
  auto-run it. "No change" is a successful outcome.
- Retro may fire its own Hermes run for outside evidence; when its report carries a
  pending runId, close the loop (`mcp__ui__hermes_feedback`) once the findings are judged.
- A "dispatch researcher" verdict is yours to execute: dispatch the `researcher` with the
  mode retro named.
- Backgrounded retro returns proposals via `mcp__ui__ask` without writing; you land the
  approved edits foreground.
