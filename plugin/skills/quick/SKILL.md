---
name: quick
agents: [orchestrator]
description: Quick-action entry point — routes a small concrete request either straight to the active domain's builder or back to the full pipeline, with one consistent report shape. Use when the user invokes /quick <task>, or asks for a small concrete change and it's unclear whether it needs the full pipeline first.
---

# /quick — small-task dispatch

The quick path is where vibe-coding sneaks back in. This skill exists so the route-direct-vs-full-pipeline decision is a checklist, not a judgment call, and so every quick action returns the same report and feeds the learning loop.

## Routing check

Route straight to the active domain's builder ONLY if all four hold:

1. **Covered** — every pattern the task needs is in an existing skill or the project's conventions; nothing structural must be invented.
2. **Small** — touches about one module/component/file (plus its immediate wiring).
3. **Observable** — the result is verifiable with the project's own checks (build / lint / test) plus one quick look.
4. **No new conventions** — no new project-wide decisions, dependencies, or folders.

If any check fails, do not dispatch directly. Report in one line _which_ check failed and why, then offer the right route: the **full pipeline** (too big / unclear scope), or **skill-researcher** (uncovered pattern — check 1 failed). Failing the check is a correct outcome of /quick, not an error.

## Dispatch (on pass)

Hand the orchestrator: the task in 1–2 sentences, which skills to load if any, the relevant project convention/doc if one applies, and the reminder that the project's checks (validate / build / test) are the mandatory gate. The orchestrator dispatches the active domain's builder.

## Report (always this shape)

- **Result** — what changed, user-visible, one sentence
- **Files** — paths touched
- **Verify** — the project's checks outcome, quoted from the builder's report
- **Friction** — from the builder's Friction line, or "none"

End by telling the user what to look at.

## Learning gate

If Friction is not "none", offer — ask, never auto-run: "Want bug-triage to look at this friction?" One offer, then drop it; the user owns the gate.
