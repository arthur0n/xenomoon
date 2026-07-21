---
description: Auto-commit a fully-gated issue (qa:pass + review:pass) — direct git, hook-enforced gate; never pushes
argument-hint: "[issue#] [--verify]"
allowed-tools: Bash, Read, Grep
---

Direct command — **no agent**. Once an issue is fully green YOU record the fix as one commit:
`git add` + `git commit` with the project's message convention, then label
`committed` + `fixed-pending-deploy` and comment the sha. **Never push** (push is the human
gate). The gate below is also enforced **deterministically by the `commit-gate` hook** — a
`git commit` citing `(#N)` is machine-checked against the issue's labels at commit time and
denied on any miss, so a slipped step cannot land.

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo:** use `{{REPO}}`; if it wasn't substituted, run
   `gh repo view --json nameWithOwner -q .nameWithOwner`. If a `gh` call 404s on the repo,
   stop and tell me.

2. **Resolve the target:** a number (e.g. `42`) → commit that issue. Empty → list
   commit-ready candidates and ask which (do **not** auto-commit all):
   `gh issue list -R {{REPO}} --state open --search "label:qa:pass label:review:pass -label:committed" --json number,title`

3. **Check the gate yourself first** (the hook re-checks, but fail early with a better
   message): labels present `analyzed` + `implemented` + `qa:pass` + `review:pass`;
   labels absent `qa:blocked`, `review:changes` (a stale block outranks a pass). Then
   `git status --porcelain` — the tree must hold the issue's fix **and nothing unrelated**
   (broader diff → stop and tell me).

4. **`--verify` (opt-in):** re-run the project's **validate** command as a final check.
   Default trusts the fresh QA + review gates — no re-run.

5. **Commit** (serialize — never alongside a running `developer` on the same tree):
   `git add -A` then `git commit` with the project's message style (read `CLAUDE.md`):
   `<type>: <imperative summary> (#N)` — **`(#N)`, never `Closes #N`** — plus a 1–2 line
   body (root cause + fix) and a `Verified: validate+build+test green · regression test
<name> · QA pass · review pass.` line.

6. **Label + comment:** apply `committed` + `fixed-pending-deploy`; comment
   `Committed in <sha> — auto-closes on deploy.`

7. **Report:** the `<sha>`, subject line, labels applied, and that **nothing was pushed**.
   On a gate miss, the exact failing condition and the next move (`/qa`, `/audit`, or
   `/implement`).

## Notes

- Typical flow: `/qa <#>` → `/audit <#>` → `/commit <#>`. Commit is **automatic once
  green** — the human gate is the **push**, not the commit (the `push-gate` hook enforces
  that too: sub-agents can never push; your push always asks the human).
- **Closing is deploy-gated.** `fixed-pending-deploy` closes when the human pushes and CI
  ships it — see `/build deploy`.
