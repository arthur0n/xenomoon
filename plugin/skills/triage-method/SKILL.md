---
name: triage-method
agents: [junior-analyst]
domain: universal
description: The triage stage's own method — the big-picture gate (is this issue even necessary), the triaged-gate and race backstop, duplicate/regression search, the sev:* rubric, the session-sized scoping rule, the `## 🔍 Triage` comment template and the label policy. Load when triaging an issue; the investigation discipline itself lives in code-investigation.
---

# Triage — the method

Investigation discipline (falsify, cite, git archaeology, confidence) lives in
`code-investigation`. Records-before-code lives in `library-first`. This skill holds what is
specific to the triage stage: the gates, the judgement calls, the output.

## 0. The triaged-gate — LABEL-ONLY, before anything else

Your first call, and the only thing you may read before the decision:

```bash
gh issue view <N> -R <repo> --json labels
```

Nothing else — not the body, not the comments, not one project or library file. If `triaged` is
present and the caller did NOT say this is a forced re-triage: **stop.** Report
`already triaged — skipped`. **A skip costs exactly this one call** — that is the whole value of
the gate, and any read you do before deciding spends what the gate was built to save. On a sweep
of thirty issues the difference is thirty API calls versus thirty investigations.

Who and when it was triaged is **optional, and comes after the decision**: only if the caller
asked, make one further call for the existing triage comment's author and date. Never pull the
body or the full comment thread on a skip path.

Never read labels from a compacted issue list — it drops them.

## 1. The big-picture gate — is this issue necessary at all?

Answer these in plain words, and put the answers at the TOP of your comment. They exist because
repos drift into tail-chasing: small issue → small change → new small issue, in circles.

1. **What GOAL does this serve?** Tie it to a real user pain and the product's priorities — not
   to code aesthetics.
2. **Symptom or cause?** If this issue patches a symptom of a deeper design problem, NAME the
   deeper problem. Ask: _would this issue exist if X worked as intended?_
3. **Verdict** — and two of the three are recommendations NOT to proceed:
   - `necessary` — real pain, correct layer → proceed to investigation.
   - `fold` — same root cause as an existing issue: name it and recommend consolidating there.
     One problem, one issue; satellites fragment the fix.
   - `not-necessary` — insurance against a problem that is not manifesting, or a fix at the wrong
     layer. Recommend closing, and name the concrete **reopen trigger** (a failing test, a
     repeated report) so closing is not a loss.

You RECOMMEND; the human decides. A triage comment without this section is incomplete.

## 2. Read it fully, then check it is new

Read the body AND the existing comments — prior stages leave findings there and re-doing their
work is pure waste. Then search open **and closed** issues for the same symptom before
investigating. A clear duplicate → lead with it: name the issue and recommend closing this one as
a duplicate. A **closed** duplicate whose symptom is back → flag it as a **regression**
(reopen-worthy) and triage what changed since it was fixed.

## 3. Classify, locate, and judge reproducibility

Classify the symptom into the project's areas (its `CLAUDE.md` owns the map). Locate the suspect
code — graph query first, raw search as fallback. Then judge whether the report reproduces: if
the cause genuinely cannot be narrowed without more from the reporter, that is a `needs-info`
outcome — and say **exactly** what is missing, never just "needs more info".

## 4. Severity rubric

- `sev:critical` — crash on load, data loss, cross-user data leak, auth fully broken. Blocks
  essentially all users.
- `sev:high` — a core flow broken with no workaround (cannot sign in, cannot complete the main
  task, key data blank).
- `sev:medium` — broken, but a workaround exists, or it hits a subset of users.
- `sev:low` — cosmetic, minor, or a rare edge case.

## 5. Scoping — the unit is a SESSION-SIZED issue

One that a normal working session can CLOSE end-to-end. Do **not** atomize into
one-issue-per-concern (that bloats the pipeline with satellites); do **not** bundle so much that
it cannot finish in a session. Naturally-coupled work rides together — a shared fix and its call
sites, one area's related guards. Genuinely bigger than a session → say so and propose the
session-sized split. The next stage verifies this scoping in its handoff.

## 6. Write-back

**Race backstop first:** re-check the labels immediately before you write. If `triaged` appeared
while you were investigating and this is not a forced run, post nothing, change no labels, report
`already triaged — skipped (raced)`. Only the first finisher writes.

Write the body to a temp file and post it (avoids shell-quoting problems with backticks and
newlines). Terse and scannable — bullets and short fragments, never prose paragraphs; every field
one line; verbatim values only; **omit any field you have nothing for**.

```
## 🔍 Triage — <one-line summary>

`sev:<level>` · `area:<area>` · confidence: <high|medium|low>

**GOAL:** <what this serves — 1 line>
**NECESSARY:** necessary | fold (#<n>) | not-necessary — <reason; reopen trigger if not-necessary>
**Symptom:** <verbatim what the reporter saw>
**Root cause:** <CONFIRMED|REFINED|WRONG + the cause>
**Suspect code:**
- `<path>:<line>` — <why, ≤6 words>
**Repro:** <yes/no + 1 line, or the exact missing info>
**Fix direction:** <high-level, 1 line — no patch, no code>
**Scoping:** <session-sized? or the proposed split>
**RECORD:** <library hit that answers this, or: none found — propose `<kind>/<slug>.md`>
**Needs from reporter:** <needs-info only — exact items>

---
*triage · junior-analyst · <git rev-parse --short HEAD>*
```

## 7. Labels

Always add `triaged`, exactly one `sev:*`, and at least one `area:*`. Add `needs-info` when the
report could not be reproduced. If a label does not exist, the edit fails — say so in your
summary and tell the caller which label to create. **Never silently drop a label**: a missing
label makes the issue invisible to the next stage's query.
