---
description: Adversarial code review of a QA-passed issue — Codex when enabled, else the native reviewer agent; applies review:pass/review:changes
argument-hint: "[issue# | empty to sweep all qa'd-unreviewed] [--force] [focus text]"
allowed-tools: Bash, Agent, Read, Grep, Glob
---

Code-review stage of the pipeline. It tries to **falsify** the uncommitted fix (scoping/
auth leaks, enum drift, swallowed errors, a test that doesn't guard the bug) and posts a
`## 🔎 REVIEW — pass|changes` verdict + `review:pass`/`review:changes` labels.

(Named `/audit`, not `/review`, because `/review` is a built-in Claude Code command that
reviews pull requests — same reason `/solution` isn't `/review`.)

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo:** use `{{REPO}}`; if it wasn't substituted, run
   `gh repo view --json nameWithOwner -q .nameWithOwner`. Use the active `gh` account
   (a project-specific account, if any, is documented in `CLAUDE.md`). If a `gh` call
   404s on the repo, stop and tell me.

2. **Parse `$ARGUMENTS`:**
   - A number (e.g. `42`) → review that one issue. Trailing free text after the number
     is **focus** for the reviewer/Codex (e.g. `42 the scoping change`).
   - Empty → **sweep** issues QA'd but not yet reviewed:
     `gh issue list -R {{REPO}} --state open --search "label:qa:pass -label:review:pass -label:review:changes" --json number,title --limit 50`
   - `--force` (anywhere in args) → re-review even if already `review:pass`/`review:changes`.

3. **Route by whether Codex is enabled** (check YOUR OWN system prompt):
   - **Codex enabled** — your system prompt contains the Codex block (the "Codex · Code
     reviewer" section with the `{{CODEX_COMPANION}}` companion path substituted to a
     real absolute path). Then **run Codex yourself** in a background Bash against the
     current working tree:

     ```
     node "<the CODEX_COMPANION absolute path from your system prompt>" adversarial-review "issue #<N>: <focus, or the issue's one-line summary>"
     ```

     Run it `run_in_background: true` (a review blocks until it finishes), then read the
     output when it completes and **post it as the `## 🔎 REVIEW` verdict** on the issue
     (map Codex's outcome to `pass`/`changes`), and apply the matching `review:pass` /
     `review:changes` label (remove the twin). **Running `/audit` on a Codex-enabled
     project IS your consent to the review** — Codex bills on OpenAI's account (the
     user's own account, NOT the Anthropic plan) and takes time. State that you're
     launching a billed Codex review when you start it.

   - **Codex not enabled** — your system prompt has no Codex block. Then **spawn the
     `reviewer` agent** (Agent tool, `subagent_type: "reviewer"`) with the issue number,
     focus, and force flag, e.g. _"Review issue #42. force=false. focus=scoping change."_
     It reads the diff + convention floor + handoff, posts the same `## 🔎 REVIEW`
     verdict, and applies the label.

   Codex review is **orchestrator-run** (background Bash), not an agent's job — the
   companion path is only substituted into your prompt, not into an agent's.

4. **Report.** Print a compact list, one issue per line:
   `# | pass/changes | top finding | (codex|native) | url`. Note any issues skipped as
   already-reviewed, and any label that failed to apply.

## Notes

- Run this on issues that already passed QA (`qa:pass`, not `qa:blocked`). Typical flow:
  `/qa <#>` → `/audit <#>` → `/commit <#>`.
- **`review:changes` loops back:** offer `/implement <N>` — the findings are the fix
  list. Do not proceed to `/commit` on a `review:changes` issue.
- Multiple issues in a sweep: the native reviewer path can run a few in parallel (it's
  read-only, capped at **4 at a time** — opus is heavy); the Codex path runs one review
  at a time in the background.
