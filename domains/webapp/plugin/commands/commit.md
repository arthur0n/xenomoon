---
description: Auto-commit a fully-gated issue (solution-ready + implemented + qa:pass + review:pass) — never pushes; --verify re-runs validate
argument-hint: "[issue#] [--verify]"
allowed-tools: Bash, Agent, Read, Grep
---

Trigger for the `committer` agent. Once an issue is fully green it records the fix as one
commit — `git add` + `git commit` with the project's message convention, then labels
`committed` + `fixed-pending-deploy` and comments the sha. It **never pushes** (push is
human/CI). The agent is the stable core; this command is just the trigger.

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo:** use `{{REPO}}`; if it wasn't substituted, run
   `gh repo view --json nameWithOwner -q .nameWithOwner`. Use the active `gh` account
   (a project-specific account, if any, is documented in `CLAUDE.md`). If a `gh` call
   404s on the repo, stop and tell me.

2. **Resolve the target:** a number (e.g. `42`) → commit that issue. Empty → list
   commit-ready candidates and ask which (do **not** auto-commit all):
   `gh issue list -R {{REPO}} --state open --search "label:qa:pass label:review:pass -label:committed" --json number,title`

3. **Spawn one `committer` agent** (Agent tool, `subagent_type: "committer"`) with the
   issue number and any `--verify` flag, e.g. _"Commit issue #42. verify=false."_
   - **One committer at a time** — it commits the shared working tree; never run two in
     parallel.

4. **Report** the agent's result: on commit, the `<sha>`, the subject line, the labels
   applied (`committed`, `fixed-pending-deploy`), and that **nothing was pushed**. On
   refusal, the exact gate condition that failed and the next move.

## The gate (the committer verifies ALL of these — it refuses otherwise)

- Labels present: `solution-ready` + `implemented` + `qa:pass` + `review:pass`.
- Labels absent: `qa:blocked`, `review:changes` (a stale block outranks a pass).
- `git status --porcelain` shows the issue's fix **and nothing unrelated** (refuse if the
  diff is broader than the issue).
- Default **trusts the fresh QA + review gates** — it does NOT re-run validate/build/test.
  `--verify` (opt-in) makes it re-run the project's **validate** command as a final check.

## Notes

- Typical flow: `/qa <#>` → `/audit <#>` → `/commit <#>`. Commit is **automatic once
  green** — the human gate is the **push**, not the commit.
- **Closing is deploy-gated.** The commit subject references the issue as `(#N)` — never
  `Closes #N` (that closes on merge, before it's live). The committer labels
  `fixed-pending-deploy` and comments `Committed in <sha> — auto-closes on deploy.`; the
  issue closes once the human pushes and CI ships it.
- The committer **never pushes** and never edits code — its only write is the commit.
  Push to the main branch yourself when ready; CI deploys (see `/build deploy`).
