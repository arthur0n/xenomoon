---
description: QA an implemented issue — re-run validate/build/test + assert the regression test guards the bug, apply qa:pass/qa:blocked
argument-hint: "[issue# | empty to sweep all implemented-unqa'd] [--force]"
allowed-tools: Bash, Agent, Read, Grep, Glob
---

Trigger for the `tester` agent. It re-runs THIS project's validate + build + test
(+ smoke on data paths), asserts the handoff-named regression test exists and guards the
bug, and posts a `## 🧪 QA — PASS|BLOCKED` verdict + `qa:pass`/`qa:blocked` labels. The
agent is the stable core; this command is just the trigger.

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo:** use `{{REPO}}`; if it wasn't substituted, run
   `gh repo view --json nameWithOwner -q .nameWithOwner`. Use the active `gh` account
   (a project-specific account, if any, is documented in `CLAUDE.md`). If a `gh` call
   404s on the repo, stop and tell me.

2. **Parse `$ARGUMENTS`:**
   - A number (e.g. `42`) → QA that one issue.
   - Empty → **sweep** issues that are implemented but not yet QA'd:
     `gh issue list -R {{REPO}} --state open --search "label:implemented -label:qa:pass -label:qa:blocked" --json number,title --limit 50`
   - `--force` (anywhere in args) → re-QA even if already `qa:pass`/`qa:blocked`.

3. **Spawn the agent.** For each target issue, use the Agent tool with
   `subagent_type: "tester"`. Prompt with the issue number and force flag, e.g.
   _"QA issue #42. force=false."_
   - The tester re-runs the project's gates against the shared working tree, so QA
     **one issue at a time** — don't run several in parallel (they'd race the same tree
     and each other's validate/build).

4. **Report.** Print a compact list, one issue per line:
   `# | PASS/BLOCKED | validate/build/test/smoke | regression test guards bug? | url`.
   Note any issues skipped as already-QA'd, and any label that failed to apply.

## Notes

- Only run this on issues that already have the `implemented` label + a developer report
  — QA gates the implement stage, it doesn't replace it. Typical flow:
  `/implement <#>` → `/qa <#>`.
- **`qa:blocked` loops back:** when the tester BLOCKS, offer `/implement <N>` — the
  blockers it listed (a failing gate, or the missing/weak regression test) are the fix
  list. Do not proceed to `/audit`/`/commit` on a blocked issue.
- The tester is read-only: it applies the verdict comment + `qa:*` labels and nothing
  else — no edits, no commits.
