---
description: Adversarial review of an implemented change — try to BREAK it. Codex when you want the external senior, the internal senior-analyst either way; applies review:pass / review:changes.
argument-hint: "[issue# | empty to sweep unreviewed] [--force] [focus]"
allowed-tools: Bash, Agent, Read, Grep, Glob
---

Trigger for the adversarial review — the `senior-analyst` agent in its **`adversarial-review`**
lane, and/or the external Codex reviewer.

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo** from the project's `CLAUDE.md`. A `gh` 404 → stop and say so.

1b. **Resolve WHICH issues.** `$ARGUMENTS` may carry an issue number, `--force`, and a focus phrase,
in any order. With **no issue number**, sweep — and note that "needs review" is NOT a label
question, so discovery is query-then-inspect, in that order:

    ```bash
    # candidates: everything QA passed that is not already blocked. review:pass is NOT excluded —
    # a pass at a stale SHA wears exactly that label, and excluding it hides the case being swept for.
    gh issue list -R <repo> --state open --label "qa:pass" \
      --search "-label:review:changes" --json number,title,updatedAt --limit 100
    ```

    Then read each candidate's newest lane verdict + evidence comments (the §0 query) and keep it if
    it is **unreviewed** (no lane verdict) or **unreconciled** (evidence newer than the lane verdict
    — §5's re-run case). Drop anything already passed: re-reviewing it burns an opus run to reprint
    a verdict.

    **Staleness is NOT a sweep question.** A `review-verified:` marker that differs from your HEAD
    means "reviewed on other code", which is the normal state of every issue whose change is not in
    your working tree right now — treating that as stale would dispatch billed reviews against a
    diff those issues have nothing to do with. Judge staleness only for the issue whose change is
    actually in this tree (the commit gate does exactly that, at commit time, for exactly that
    issue). List the others as `reviewed at <short sha> — not this checkout` and move on.

    Run steps 2–5 on what survives, **oldest first**. If more than ~10 survive, do those and say
    plainly how many you left — a silent cap reads as "swept everything". An empty sweep is a result:
    say "nothing awaiting review", never invent work.

2. **Choose the reviewers — this is a judgement, not a branch.**

   **Codex does NOT replace the internal senior.** Codex is the _first_ quality control, an external
   senior with no stake in how the fix was designed; the internal `senior-analyst` knows this
   project's conventions and local rules. They see different things, so which you run depends on
   what is being delivered:

   - **auth · money · data scoping · migrations · anything irreversible** → run both.
   - **ordinary product code** → the internal senior; add Codex when the change is large or you
     want a second, unrelated pair of eyes.
   - **trivial glue, cosmetic, sev:low** → the sweep may already be enough; say so rather than
     performing ceremony.

   **Propose your choice and let the human decide** when the call is not obvious. Running Codex
   spends the user's own OpenAI account, and running neither spends their trust.

3. **Codex path** (when chosen, and when your system prompt carries the Codex block): run the
   companion yourself in a background Bash —

   ```
   node "<the CODEX_COMPANION path from your prompt>" adversarial-review "issue #<N>: <focus>"
   ```

   Post its output under its **own** header — `## 🔎 CODEX REVIEW — pass | changes` — and **do not
   put `review-verified:` / `review-changes-at:` on it, and do not set a label from it.** It is one
   reviewer's evidence, not the lane's verdict.

   Say you are launching a billed review before you start it.

4. **Internal path:** dispatch with `subagent_type: "senior-analyst"`, naming the lane —
   _"Audit issue #42 in owner/repo — run the `adversarial-review` skill. focus=<…>. force=false."_

   - **Only reviewer** → its `## 🔎 REVIEW` verdict IS the lane's verdict, markers and label and all.
   - **One of two** → say so in the brief (_"Codex also reviewed this — you are one of two"_). It
     then posts `## 🔎 INTERNAL REVIEW` with no marker and no label, exactly like Codex, and step 5
     writes the only `## 🔎 REVIEW`. **Never let two reviewers post into the lane**: the newest lane
     comment wins, so the second post would silently erase the first.

5. **When BOTH ran, YOU write the single reconciled verdict — and any block wins.**

   This is the one place the pipeline could silently lose a blocking review: the commit gate and the
   review skill both take the **newest** `## 🔎 REVIEW` comment as authoritative, so if two reviewers
   each posted one, the later one would simply erase the earlier. That would let a Codex `changes`
   be overwritten by an internal `pass` on exactly the high-risk change that earned two reviewers.
   Steps 3 and 4 keep both OUT of the lane precisely so this step is the only writer.

   So: after both have reported, post **exactly one** `## 🔎 REVIEW` comment that reconciles them —

   - **either reviewer says `changes` → the verdict is `changes`.** No averaging, no "the other one
     was happy". Its findings go in the list, attributed.
   - **both pass → `pass`**, and say so in the PROBED line (`codex + internal`).
   - Then the markers and the label follow that reconciled verdict, once.

   Disagreement is a **result**: relay both readings in the comment rather than resolving them into
   a summary the human cannot audit.

   **Re-running to reconcile.** When a previous run posted the Codex comment and died before writing
   the reconciled verdict, the commit gate asks about it and names this command as the fix. That
   re-run must NOT skip: the internal reviewer's own skip gate treats a `## 🔎 CODEX REVIEW` newer
   than the lane verdict as "not reviewed", so dispatch it normally and say in the brief that a
   Codex review is already on the issue awaiting reconciliation. A re-run that reports
   `already reviewed` here means the skip gate was not honored — the run is not finished.

6. **Report** one line per issue: `# | pass/changes | top finding | (codex|internal|both) | url`.

## Notes

- **`changes` needs a concrete hole at `path:line`.** Vague unease is not a block — that rule is in
  the skill, and relaying a vague block teaches everyone to route around review.
- **A `pass` should say what was probed.** A pass that lists no attempted attacks is a rubber stamp.
- **Run this after QA has something to judge** — the change must exist in the tree. `review:changes`
  routes back to `/implement`.
- Two reviewers disagreeing is a **result**, not a problem: relay both verdicts rather than
  averaging them into a summary the human cannot audit.
