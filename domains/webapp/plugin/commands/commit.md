---
description: Auto-commit a fully-gated issue (qa:pass + review:pass) — direct git, hook-enforced gate; never pushes
argument-hint: "[issue#] [--verify]"
allowed-tools: Bash, Read, Grep
---

Direct command — **no agent**. Once an issue is fully green YOU record the fix as one commit:
`git add` + `git commit` with the project's message convention, then label
`committed` + `fixed-pending-deploy` and comment the sha. **Never push** (push is the human
gate). The gate below is also enforced **deterministically by the `commit-gate` hook** — a
`git commit` citing `(#N)` is machine-checked at commit time against the issue's labels AND
against the SHA each verdict recorded, and denied on any miss, so a slipped step cannot land.

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo:** use `{{REPO}}`; if it wasn't substituted, run
   `gh repo view --json nameWithOwner -q .nameWithOwner`. If a `gh` call 404s on the repo,
   stop and tell me.

2. **Resolve the target:** a number (e.g. `42`) → commit that issue. Empty → list
   commit-ready candidates and ask which (do **not** auto-commit all):
   `gh issue list -R {{REPO}} --state open --search "label:qa:pass label:review:pass -label:committed" --json number,title`

3. **Check the gate yourself first** (the hook re-checks, but fail early with a better
   message): labels present `solution-ready` + `implemented` + `qa:pass` + `review:pass`;
   labels absent `qa:blocked`, `review:changes` (a stale block outranks a pass). Then the
   **SHA binding** — the newest `qa-verified:` / `review-verified:` markers in the issue's
   comments must both equal `git rev-parse HEAD`:

   ```bash
   gh issue view <N> -R {{REPO}} --json comments -q '.comments[].body' | grep -oE '(qa|review)-verified: [0-9a-f]{7,40}' | tail -2
   ```

   A marker on a different SHA means the code moved since that verdict → re-run `/qa <N>`
   (and `/audit <N>`); they re-verify automatically now. Then `git status --porcelain` — the
   tree must hold the issue's fix **and nothing unrelated** (broader diff → stop and tell me).

4. **`--verify` (opt-in):** re-run the project's **validate** command as a final check.
   Default trusts the fresh QA + review gates — no re-run.

5. **Commit** (serialize — never alongside a running implement stage on the same tree):
   `git add -A` then `git commit` with the project's message style (read `CLAUDE.md`):
   `<type>: <imperative summary> (#N)` — **`(#N)`, never `Closes #N`** — plus a 1–2 line
   body (root cause + fix) and a `Verified: validate+build+test green · regression test
<name> · QA pass · review pass.` line.

6. **Label + comment:** apply `committed` + `fixed-pending-deploy`; comment
   `Committed in <sha> — auto-closes on deploy.` (The `commit-label` PostToolUse hook also
   stamps `committed` + `fixed-pending-deploy` and drops `needs-deploy` deterministically once
   the `(#N)` commit lands — so a slipped step can't orphan the issue. Your comment still adds
   the human-readable sha note.)

7. **Report:** the `<sha>`, subject line, labels applied, and that **nothing was pushed**.
   On a gate miss, the exact failing condition and the next move (`/qa`, `/audit`, or
   `/implement`).

8. **Graduate the design doc (separate, AFTER the fix commit — never inside it).** If the
   issue had a PRD (`design/<slug>.md`): propose (human-gated) moving its durable facts
   to `.claude/library/business-rules.md` (+ the `CLAUDE.md` index line), move the doc to
   `design/archive/<slug>.md`, and comment the new path on the issue. Keep this out of
   the issue's commit — the gate's "nothing unrelated" rule applies to the fix commit
   only.

## Notes

- Typical flow: `/qa <#>` → `/audit <#>` → `/commit <#>`. Commit is **automatic once
  green** — the human gate is the **push**, not the commit (the `push-gate` hook enforces
  that too: sub-agents can never push; your push always asks the human).
- **Closing is deploy-gated.** `fixed-pending-deploy` closes when the human pushes and CI
  ships it — see `/build deploy`. `fixed-pending-deploy` is the ONLY label the
  `close-deployed-issues` workflow reads; the `commit-label` hook guarantees it lands at commit
  time (history: #43/#45/#47 merged but stayed open because only `needs-deploy` was set).
