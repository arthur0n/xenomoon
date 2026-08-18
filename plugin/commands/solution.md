---
description: Design the fix for a triaged issue — verify the root cause, specify the change, post the `## 🔬 ANALYSIS` spec + solution-ready. Stage 2 of the pipeline.
argument-hint: "[issue# | empty to sweep triaged-but-undesigned] [--force]"
allowed-tools: Bash, Agent, Read, Grep, Glob
---

Trigger for the `senior-analyst` agent — stage 2 of the pipeline
(**triage → solution → implement → verify → human**). The agent is the stable core; this command
is just the trigger.

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo** from the project's `CLAUDE.md` (repo + which `gh` account). A `gh` 404 →
   stop and say so rather than guessing an account.

2. **Parse `$ARGUMENTS`:**
   - A number → design that one issue.
   - Empty → **sweep** issues that are triaged but not yet designed (`triaged` present,
     `solution-ready` absent, no open blocker label).
   - `--force` → re-design even when `solution-ready` is present.

3. **Dispatch the agent** with the Agent tool, `subagent_type: "senior-analyst"`. **Put the repo in
   the brief** with the issue number and force flag — e.g. _"Design the fix for issue #42 in
   owner/repo. force=false."_ Its first action is a label-only gate, so it must not open a project
   file to learn where the issue lives.
   - **Serial, not parallel.** Unlike triage, this stage reads deeply and its output is a spec
     someone implements next; run one at a time so two specs never race the same area.

4. **Report.** One line per issue: `# | verdict (confirmed/refined/wrong) | ships (deploy/migration) | regression test specified? | url`.

## Notes

- **A `WRONG` verdict is the stage paying for itself.** Triage's cause was mistaken and it was
  caught before code was written — relay that as the headline, and re-triage if the real cause sits
  in another area.
- **No triage record → the agent stops.** That is correct behaviour, not a failure: send the issue
  through `/triage` first.
- The spec's `TESTABILITY` field is a commitment the next stage is held to — if it says a unit test
  guards the bug, `/qa` will check that the test exists and actually guards it.
- This stage never implements. If the design turns out trivial, it is still the developer who
  writes it — the boundary is what keeps the second read independent.
