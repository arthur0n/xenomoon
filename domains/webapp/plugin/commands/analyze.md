---
description: Investigate GitHub issue(s) — falsify the cause, design the fix, post one ANALYSIS comment + analyzed/sev/area labels
argument-hint: "[issue# | empty to sweep all unanalyzed] [--force]"
allowed-tools: Bash, Agent, Read, Grep, Glob
---

Trigger for the `analyst` agent (opus, read-only). It investigates a bug against the
codebase, falsifies its own root cause, designs the minimal fix, and posts one
`## 🔬 ANALYSIS` comment + `analyzed` / `sev:*` / `area:*` (+ `needs-deploy` /
`needs-migration`) labels. The agent is the stable core; this command is just the trigger.

(A symptom/defect goes here. Something about **what the thing should do** — vague intent, a
feature, "we don't use Y, do Z" — goes to `/design` instead; the analyst investigates
symptoms, not intent.)

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo:** use `{{REPO}}`; if it wasn't substituted, run
   `gh repo view --json nameWithOwner -q .nameWithOwner`. Use the active `gh` account (a
   project-specific account, if any, is documented in `CLAUDE.md`). If a `gh` call 404s on
   the repo, stop and tell me.

2. **Parse `$ARGUMENTS`:**
   - A number (e.g. `42`) → analyze that one issue.
   - Empty → **sweep** every open, unanalyzed issue (legacy labels excluded at the query
     level so migrated issues aren't re-swept):
     `gh issue list -R {{REPO}} --state open --search "-label:analyzed -label:triaged -label:solution-ready" --json number,title --limit 50`
   - `--force` (anywhere in args) → re-analyze even if already `analyzed`.

3. **Spawn the agent.** For each target issue, use the Agent tool with
   `subagent_type: "analyst"`. Prompt it with the issue number and whether this is a forced
   re-analysis, e.g. _"Analyze issue #42. force=false."_
   - Multiple issues → launch **in parallel** (multiple Agent calls in one message), capped
     at **4 at a time** (opus is heavy); batch the rest and tell me how many remain.
   - Single issue → one agent.

4. **Report.** Print a compact list, one issue per line:
   `# | severity | area | verdict (confirmed/refined/wrong) | needs-deploy? | needs-migration? | one-line cause | url`.
   Note any issues skipped as already-analyzed, any that the analyst routed to `/design`
   (intent conflict) or left `needs-info`, and any label that failed to apply (e.g.
   `analyzed` not yet created in the repo).

## Notes

- The agent posts the durable record (comment + labels) on each issue; this command only
  orchestrates and summarizes.
- **Migration note:** the sweep query excludes the legacy `triaged` / `solution-ready`
  labels so pre-migration issues aren't re-analyzed. A handful of open `triaged` issues can
  simply be relabeled `analyzed` by hand, or picked up by their first `/analyze <#>`.
- **Background scheduling:** run `/loop 1h /analyze` in a session to auto-sweep new issues
  hourly. The sweep only touches issues still missing `analyzed`, so repeat runs are
  idempotent. End the session to stop.
- Pipeline: `/feedback` → `/design`? → `/analyze` → `/implement` → `/qa` → `/audit` →
  `/commit` → `/build`. An analyzed issue is ready for `/implement`.
