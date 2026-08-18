---
description: Triage an issue — investigate it against the project, post a `## 🔍 Triage` verdict + triaged / sev:* / area:* labels. Stage 1 of the pipeline.
argument-hint: "[issue# | empty to sweep untriaged] [--force]"
allowed-tools: Bash, Agent, Read, Grep, Glob
---

Trigger for the `junior-analyst` agent — stage 1 of the pipeline
(**triage → solution → implement → verify → human**). The agent is the stable core; this command
is just the trigger.

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo.** Take it from the project's `CLAUDE.md` (repo + which `gh` account to
   use). If a `gh` call 404s on the repo, stop and say so rather than guessing an account.

2. **Parse `$ARGUMENTS`:**
   - A number (e.g. `42`) → triage that one issue.
   - Empty → **sweep** the untriaged: list open issues without `triaged` and without
     `needs-info`, newest first, and triage them one at a time.
   - `--force` (anywhere in args) → re-triage even when `triaged` is already present.

3. **Dispatch the agent.** For each target issue, use the Agent tool with
   `subagent_type: "junior-analyst"`. **Put the repo in the brief** alongside the issue number and
   the force flag — e.g. _"Triage issue #42 in owner/repo. force=false."_ The agent's first action
   is a label-only gate, so it must not open a project file just to learn where the issue lives;
   you already resolved that in step 1. Beyond those three values the brief carries pointers, never
   a re-specification of the method — the agent's skills own that.
   - Triage is the pipeline's one **fan-out** point: several issues may be triaged in parallel
     (the agent is read-only, so they cannot clobber each other). The per-issue stages after it
     are serial.

4. **Report.** One line per issue: `# | sev | area | necessary/fold/not-necessary | one-line cause | url`.
   Name any issue skipped as already-triaged, and any label that failed to apply.

## Notes

- **`fold` and `not-necessary` are results, not failures.** When the agent recommends folding
  into another issue or closing with a reopen trigger, relay that as the headline — the cheapest
  fix is the issue nobody has to implement. Closing stays the human's call.
- **A `needs-info` outcome ends the pipeline for now** — the issue waits on its reporter. Don't
  push it to the next stage to "unblock" it.
- The agent stops at the **cause**. Designing the fix is the next stage; a triage comment that
  contains an implementation plan is a stage-boundary violation, not a bonus.
