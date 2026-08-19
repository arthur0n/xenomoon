---
description: QA an implemented issue — re-run the project's gates, assert the regression test guards the bug, apply qa:pass / qa:blocked. The deploy switch.
argument-hint: "[issue# | empty to sweep implemented-unQA'd] [--force]"
allowed-tools: Bash, Agent, Read, Grep, Glob
---

Trigger for the `tester` agent — the verify stage of the pipeline
(**triage → solution → implement → verify → human**). The agent is the stable core; this command is
just the trigger.

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo** from the project's `CLAUDE.md` (repo + which `gh` account). A `gh` 404 →
   stop and say so rather than guessing an account.

2. **Parse `$ARGUMENTS`:**
   - A number → QA that one issue.
   - Empty → **sweep** issues that are `implemented` but carry no `qa:*` verdict yet.
   - `--force` → re-QA at the SAME commit. You rarely need it for moved code: the agent keys its
     idempotency on the `qa-verified: <sha>` marker, so a targeted run re-verifies by itself once
     HEAD differs from the SHA the pass was earned on.

3. **Dispatch the agent** with the Agent tool, `subagent_type: "tester"`. **Put the repo in the
   brief** with the issue number and force flag — its first action is a label-only gate, so it must
   not open a project file to learn where the issue lives.
   - **One at a time.** The tester runs the project's gates against the shared working tree; two in
     parallel race each other's validate and build.

4. **Report.** One line per issue: `# | PASS/BLOCKED | validate/build/test/smoke | regression test guards bug? | url`.

## Notes

- **`qa:pass` is the deploy switch**, not a status note: projects gate their deploy workflow on it.
  Relay a BLOCKED verdict as the headline, never as a caveat at the end.
- **BLOCKED loops back to the implement stage** — the blockers are the fix list. Do not proceed to
  review or commit on a blocked issue.
- **A missing or toothless regression test BLOCKS even when every command is green.** That is the
  stage working as designed: the gates prove the code runs today, the test proves the bug cannot
  return unnoticed.
- Run this only on issues that already carry `implemented` — QA gates the implement stage, it does
  not replace it.
