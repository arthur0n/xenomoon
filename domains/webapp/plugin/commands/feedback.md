---
description: Turn raw feedback into a GitHub issue — route defects to /analyze, product intent to /design
argument-hint: "<freeform notes> [--analyze]"
allowed-tools: Bash, Agent, Read, Grep, Glob
---

Intake trigger: convert raw feedback (from a tester or from me) into a clean,
well-formed GitHub issue — and route it to the right next stage.

Raw notes: `$ARGUMENTS`

## Step 0 — discriminate: DEFECT vs INTENT (do this first)

Feedback splits two ways, and they go to different places. Read the notes and decide:

- **DEFECT** — something is **broken** against how it already works: a crash, an error, a
  wrong result, data blank/leaked, a regression. → files a `bug` issue, investigated by
  **`/analyze`**.
- **INTENT / product change** — a statement about how the product **should** behave: a new
  feature, a vague ask ("we want X"), or a "we don't use Y, do Z" that expresses a business
  rule or a change of direction. This is **not a bug** — there's no defect to trace, there's
  a decision to capture. → goes to **`/design`** (the designer interviews, captures the rule
  verbatim, writes a PRD). **Never file intent as a bug and send it to `/analyze`** — the
  analyst would manufacture a code hypothesis for a thing that was never broken (the exact
  failure this pipeline exists to stop).

If a note mixes both (a real bug AND a "and also it should…"), split it: a `bug` issue for
the defect, and route the intent to `/design`.

## Steps

1. **Resolve the repo:** use `{{REPO}}`; if it wasn't substituted, run
   `gh repo view --json nameWithOwner -q .nameWithOwner`. Use the active `gh` account (if
   this project needs a specific one, it's in `CLAUDE.md` — otherwise don't switch). If a
   `gh` call 404s on the repo, stop and tell me.

2. **Restructure the notes** into a clean issue. Don't invent facts — only use what's in
   the notes; leave a field out if it isn't there.
   - **Title:** short, specific, imperative-ish (e.g. "Stats page shows blank after
     completing a session").
   - **Body** (markdown):

     ```
     **What happened:** …
     **Expected:** …            (only if implied)
     **Steps to reproduce:**    (only if given)
     1. …
     **Account / area:** …      (e.g. signed-in user, which feature/screen)
     **Env:** …                 (prod URL / local dev — only if given)

     > Filed via /feedback from raw notes.
     ```

   - **Label:** `bug` for a defect; `feedback` otherwise. (For a clearly INTENT note you're
     routing to `/design`, prefer opening it there — but if you file it here for tracking,
     label it `feedback`, never `bug`.)
   - If the notes clearly contain **several distinct problems**, create **one issue per
     problem** rather than a single muddled issue.

3. **Create the issue(s):**
   `gh issue create -R {{REPO}} --title "<title>" --body-file /tmp/feedback-<n>.md --label "<bug|feedback>"`
   Echo each new issue's number and URL.

4. **Route by the Step 0 verdict:**
   - **Intent** → suggest (or, if `--analyze` was NOT given and it's clearly a product
     decision, hand off to) **`/design`** — the designer captures the rule and writes the
     PRD. Do not send intent to `/analyze`.
   - **Defect** → if `--analyze` is present in the args, immediately spawn the `analyst`
     agent (Agent tool, `subagent_type: "analyst"`) for each newly created bug issue, then
     summarize its findings. Otherwise suggest I run `/analyze <#>` when I want it
     investigated.

## Notes

- Keep titles/bodies faithful to the reporter — this is clean-up and structuring, not
  embellishment.
- This command files issues + routes; it never investigates code (that's `/analyze`) and
  never designs (that's `/design`).
- Pipeline: `/feedback` → `/design`? → `/analyze` → `/implement` → `/qa` → `/audit` →
  `/commit` → `/build`.
