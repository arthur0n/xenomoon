---
description: Implement a solution-ready issue's fix (developer agent) + verify with the project's validate/build/test
argument-hint: "[issue#]"
allowed-tools: Bash, Agent, Read, Edit, Write, Grep, Glob
---

Trigger for the `developer` agent. It reads the senior-dev handoff, implements the fix
to convention, and proves it with the project's validate + build commands + the test the
handoff specifies. The agent is the stable core; this command is just the trigger.

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo:** use `{{REPO}}`; if it wasn't substituted, run
   `gh repo view --json nameWithOwner -q .nameWithOwner`. Use the active `gh` account
   (a project-specific account, if any, is documented in `CLAUDE.md`). If a `gh` call
   404s on the repo, stop and tell me.

2. **Resolve the target:**
   - A number (e.g. `42`) → implement that issue.
   - Empty → list candidates and ask which (do **not** auto-implement all):
     `gh issue list -R {{REPO}} --state open --search "label:solution-ready" --json number,title`

3. **Spawn one `developer` agent** (Agent tool, `subagent_type: "developer"`) with the
   issue number, e.g. _"Implement issue #42."_
   - **One issue at a time.** The agent edits the working tree, so do NOT run several in
     parallel (they'd clobber each other). If I ask for multiple, run them
     **sequentially** and pause between for me to review/commit each.

4. **Report** the agent's result: files changed, the validate + build status,
   the test added (red→green), any deviation from the handoff or scoping-sensitive
   surface, and the issue URL. Remind me the change is **uncommitted** — I review the
   diff and commit when ready.

5. **Offer to verify locally** (using the developer's reported ship path and the
   project's commands — see `CLAUDE.md` → Commands):
   - backend fix → testable via the project's dev server / integration command; ships
     via its backend CI deploy.
   - frontend fix → testable via the project's app dev server; ships via its frontend
     CI deploy.
   - Offer `/build` to run the local production build / smoke. Do **not** deploy —
     deploy is CI-only on push to the main branch (see `/build deploy`).

## Notes

- Pipeline: `/feedback` → `/triage` → `/solution` → `/implement` → `/build`.
- **Closing is deploy-gated.** When the fix is committed: reference the issue as `(#N)`
  in the subject — do NOT use `Closes #N` (closes on merge, before it's live). Instead
  label `fixed-pending-deploy` and comment `Fixed in <sha> — auto-closes on deploy.`
- Run `/implement` only on issues that already have a `solution-ready` handoff.
- The agent must leave the project's validate + build green and add the regression test
  before it's done.
