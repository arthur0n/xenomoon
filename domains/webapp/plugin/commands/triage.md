---
description: Investigate GitHub issue(s) and post findings + triage labels back on them
argument-hint: "[issue# | empty to sweep all untriaged] [--force]"
allowed-tools: Bash, Agent, Read, Grep, Glob
---

Trigger for the `bug-triage` agent. The agent is the stable core; this command is just
the on-demand trigger.

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo:** use `{{REPO}}`; if it wasn't substituted, run
   `gh repo view --json nameWithOwner -q .nameWithOwner`. Use the active `gh` account
   (a project-specific account, if any, is documented in `CLAUDE.md`). If a `gh` call
   404s on the repo, stop and tell me.

2. **Parse `$ARGUMENTS`:**
   - A number (e.g. `42`) → triage that one issue.
   - Empty → **sweep**: list every open, untriaged issue with
     `gh issue list -R {{REPO}} --state open --search "-label:triaged" --json number,title --limit 50`
   - The flag `--force` (anywhere in args) → re-triage even if already `triaged`.

3. **Spawn the agent.** For each target issue, use the Agent tool with
   `subagent_type: "bug-triage"`. Prompt it with the issue number and whether this is a
   forced re-triage, e.g.: _"Triage issue #42. force=false."_
   - Multiple issues → launch the agents **in parallel** (multiple Agent calls in one
     message), capped at **6 at a time**; if more than 6 are untriaged, do them in
     batches and tell me how many remain.
   - Single issue → one agent.

4. **Report.** Collect each agent's receipt and print a compact list, one issue per line:
   `# | severity | area | one-line root cause | url`. Note any issues skipped as
   already-triaged, and any label that failed to apply.

## Notes

- The agent posts the durable record (comment + labels) on each issue; this command
  only orchestrates and summarizes.
- **Background scheduling:** run `/loop 1h /triage` in a session to auto-sweep new
  issues hourly. The sweep only touches issues still missing `triaged`, so repeat runs
  are idempotent. End the session to stop.
