---
description: Implement an analyzed issue's fix (developer agent) + verify with the project's validate/build/test
argument-hint: "[issue#]"
allowed-tools: Bash, Agent, Read, Edit, Write, Grep, Glob
---

Trigger for the `developer` agent. It reads the analyst ANALYSIS handoff (and a PRD's
Acceptance when one exists), implements the fix to convention, and proves it with the
project's validate + build commands + the test the handoff specifies. The agent is the
stable core; this command is just the trigger.

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo:** use `{{REPO}}`; if it wasn't substituted, run
   `gh repo view --json nameWithOwner -q .nameWithOwner`. Use the active `gh` account
   (a project-specific account, if any, is documented in `CLAUDE.md`). If a `gh` call
   404s on the repo, stop and tell me.

2. **Resolve the target:**
   - A number (e.g. `42`) → implement that issue.
   - Empty → list candidates and ask which (do **not** auto-implement all):
     `gh issue list -R {{REPO}} --state open --search "label:analyzed -label:implemented" --json number,title`

3. **Spawn one `developer` agent** (Agent tool, `subagent_type: "developer"`) with the
   issue number, e.g. _"Implement issue #42."_
   - **One issue at a time.** The agent edits the working tree, so do NOT run several in
     parallel (they'd clobber each other). If I ask for multiple, run them
     **sequentially** and pause between for me to review/commit each.

4. **Report** the agent's result: files changed, the validate + build status,
   the test added (red→green), the `implemented` label it applied, any deviation from the
   handoff or scoping-sensitive surface, and the issue URL. The change is
   **uncommitted** — the pipeline auto-commits only after QA + review pass.

5. **Chain to `/qa`.** The change is not done until it clears the QA gate. Offer
   `/qa <N>` next — the `tester` re-runs validate/build/test and asserts the regression
   test guards the bug, then `/audit` reviews, then `/commit` records it. Do **not** tell
   me to commit by hand; the pipeline commits once green.
   - Optionally offer `/build` to eyeball the local production build first. Do **not**
     deploy — deploy is CI-only on push to the main branch (see `/build deploy`).

## Notes

- Pipeline: `/feedback` → `/design`? → `/analyze` → `/implement` → `/qa` → `/audit` →
  `/commit` → `/build`. Loop-backs: `qa:blocked` / `review:changes` come back to
  `/implement`.
- **One issue at a time** — the developer edits the shared working tree; never run two in
  parallel.
- **Closing is deploy-gated.** The `/commit` step (not this stage) writes the commit: it
  references the issue as `(#N)` — never `Closes #N` (closes on merge, before it's live) —
  labels `fixed-pending-deploy`, and comments `Committed in <sha> — auto-closes on deploy.`
- Run `/implement` only on issues that already have an `analyzed` ANALYSIS handoff.
- The agent must leave the project's validate + build green, add the regression test, and
  label the issue `implemented` before it's done — then it hands to `/qa`.
