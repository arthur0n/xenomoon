---
description: Senior-dev solution pass on triaged issue(s) — verify root cause, design fix, post handoff
argument-hint: "[issue# | empty to sweep all triaged-unsolved] [--force]"
allowed-tools: Bash, Agent, Read, Grep, Glob
---

Trigger for the `senior-dev` agent (opus). It reviews a bug **after** bug-triage:
verifies the root cause, designs the fix, and posts a caveman handoff document. The
agent is the stable core; this command is just the trigger.

(Named `/solution`, not `/review`, because `/review` is a built-in Claude Code command
that reviews pull requests.)

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo:** use `{{REPO}}`; if it wasn't substituted, run
   `gh repo view --json nameWithOwner -q .nameWithOwner`. Use the active `gh` account
   (a project-specific account, if any, is documented in `CLAUDE.md`). If a `gh` call
   404s on the repo, stop and tell me.

2. **Parse `$ARGUMENTS`:**
   - A number (e.g. `42`) → solve that one issue.
   - Empty → **sweep** issues that are triaged but not yet solved:
     `gh issue list -R {{REPO}} --state open --search "label:triaged -label:solution-ready" --json number,title --limit 50`
   - `--force` (anywhere in args) → re-review even if already `solution-ready`.

3. **Spawn the agent.** For each target issue, use the Agent tool with
   `subagent_type: "senior-dev"`. Prompt with the issue number and force flag, e.g.
   _"Review issue #42. force=false."_
   - Multiple issues → launch **in parallel** (multiple Agent calls in one message),
     capped at **4 at a time** (opus is heavier); batch the rest and tell me how many
     remain.
   - Single issue → one agent.

4. **Report.** Print a compact list, one issue per line:
   `# | verdict (confirmed/refined/wrong) | needs-deploy? | needs-migration? | one-line fix | url`.
   Note any issues skipped as already `solution-ready`, and any label that failed to apply.

## Notes

- Only run this on issues that already have a triage comment + `triaged` label —
  senior-dev reviews the triage, it doesn't replace it. Typical flow:
  `/feedback` → `/triage <#>` → `/solution <#>`.
- The agent posts the durable handoff (comment + `solution-ready`, plus `needs-deploy`
  / `needs-migration` when applicable). This command only orchestrates.
