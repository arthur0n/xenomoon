---
name: adversarial-review
agents: [senior-analyst]
domain: universal
description: Try to BREAK an implemented fix before it ships — six falsification dimensions plus the project's own conventions, a pass only when you genuinely attacked it, and a `changes` only with a concrete hole at path:line. Posts the `## 🔎 REVIEW` verdict + review:* labels with a PASS-only SHA marker. Load when auditing an implemented change.
---

# Adversarial review — try to break it on paper

A fix has been implemented. Your job is **not** to confirm it looks reasonable; it is to hunt for
the way it is wrong, and to say honestly whether you found one. Default to skepticism: a fix that
survives a genuine falsification attempt earns `pass`.

You are not re-implementing and not re-designing. You read the **actual diff**, not its description.

## 0. Gate — the NEWEST verdict decides, and it is a comment, not a label

Capture `git rev-parse HEAD`, then read the newest comment in the review lane **and the newest
external review**, because a lane pass can be superseded by a reviewer that never got folded in:

```bash
issuekit show <N> --digest --lane review
```

That prints the newest `## 🔎 REVIEW —` AND the newest `## 🔎 CODEX|INTERNAL REVIEW` as two
blocks (capped head+tail; `--full` lifts it). Its selectors are **the same ones the commit gate
uses** to spot unreconciled findings — one definition, so a re-run of this skill can never see less
than the gate does.

- The newest of the two is a **`## 🔎 CODEX REVIEW`** (or `## 🔎 INTERNAL REVIEW`) → that is a
  reviewer's evidence with no reconciled verdict behind it. **Do not skip, whatever the lane verdict
  says** — review now, per §5. This is the recovery path the commit gate points at when it asks
  about unreconciled findings; skipping here would leave that ask unanswerable except by a human
  overriding a stale verdict.
- Newest verdict is **pass** and its `review-verified: <sha>` equals HEAD → post nothing, report
  `already reviewed at <short sha> — skipped`.
- Newest verdict is **changes** → route back to the implement stage, unforced, **whatever the
  labels say**. A `review:pass` label behind a newer changes verdict means a label edit failed, not
  that the fix recovered.
- A **pass at a different SHA**, or no verdict → review it now. The code moved under the verdict.
- `--force` re-runs regardless.

## 1. Read what you are judging

The issue, the `## 🔬 ANALYSIS` spec (the intended fix: FIX / WATCH / TESTABILITY), the QA verdict
if one exists, and then the change itself: `git status --porcelain && git diff && git diff --staged`.

**Read every hunk, and open the surrounding code where the diff is not self-explaining — a leak
usually lives in what the diff did NOT touch.** For blast radius, `graphify affected "<file>"`
beats grepping for callers.

## 2. The project's own rules come first

Before generic footguns, judge against **this project's floor**: its `CLAUDE.md` conventions, its
NEVER list, its `domain-conventions` skill if the pack ships one, and any local rule the repo
states. A change that is clean in the abstract but violates the project's own convention is
`changes` — the project's rules outrank your priors, and they are usually there because something
already went wrong once.

## 3. Falsify — six dimensions, cited at `path:line` when they hit

Ask concretely how each could be true of THIS diff:

- **Scoping / tenancy leak** — a user-owned query that skips the project's scoping layer; a new
  table without its scope entry; a fix that returns another user's data, or over-blocks the owner's.
- **Auth / session boundary** — auth logic that escaped the single adapter; a check that is
  bypassable or applied on the wrong side.
- **Enum / label / type drift** — comparing or storing a display label instead of the stable code;
  a literal that dodges the project's label system; a type imported across a boundary it shouldn't
  cross.
- **Swallowed errors / validation gaps** — a caught-and-ignored error, unvalidated input, a newly
  reachable 500 or silent wrong answer.
- **Weak or absent regression test** — the test named in TESTABILITY exists but passes without
  exercising the bug's path, or asserts the symptom so loosely that the pre-fix code would also
  pass. **A test that guards nothing is `changes`.**
- **Scope creep / collateral** — the diff changes things unrelated to the issue, or the fix is
  broader than the root cause warrants.

## 4. Decide, honestly

- **`pass`** only when you genuinely tried to break it and could not — and **say what you probed**.
  A pass that lists no attempts is a rubber stamp.
- **`changes`** only when you can name a concrete, actionable hole at `path:line`. **Vague unease is
  not a block** — either locate it or pass. Blocking on a feeling teaches everyone to route around
  the reviewer.

## 5. Write-back

```
## 🔎 REVIEW — pass | changes

**PROBED:** <what you actually attacked — scoping · auth · enum drift · errors · test · scope>
**FINDINGS:**
- `path:line` — <concrete hole + why it matters> | none
**TEST GUARDS BUG:** yes | no — <one line>

---
*adversarial review · senior-analyst · <output of: git rev-parse --short HEAD>*
review-verified: <output of: git rev-parse HEAD>      ← PASS ONLY
```

**The marker depends on the verdict, and it is a safety property:** a `pass` ends with
`review-verified: <full sha>`; a `changes` ends with `review-changes-at: <full sha>` and **never**
carries `review-verified:`. The commit gate reads `review-verified:` as proof this code was
reviewed — if a blocking verdict also carried it, one failed label edit beside a stale
`review:pass` would let a rejected fix commit.

**On a `changes` verdict, label BEFORE posting.** The label is the block; the comment only explains
it. An interrupted run should leave the issue blocked-without-detail, never explained-but-unblocked.

**Everything in this section — the markers and the labels — belongs to whoever writes the LANE
verdict.** That is you when you are the only reviewer. When you are one of two (next paragraph),
you write neither: you post evidence and return.

**When you are ONE OF TWO reviewers** — the dispatch brief says so, and an external
`## 🔎 CODEX REVIEW` is on the issue — **you do not write the lane verdict.** Post the same body
under `## 🔎 INTERNAL REVIEW — pass | changes` instead, with **no `review-verified:` /
`review-changes-at:` marker and no label**. The orchestrator then writes the single reconciled
`## 🔎 REVIEW`, where **any `changes` from either reviewer makes the verdict `changes`.**

That header discipline is a safety property, not bookkeeping. The gate and this skill both read the
**newest** `## 🔎 REVIEW` as authoritative, so if two reviewers each posted one, the later would
erase the earlier — a Codex block overwritten by your pass on exactly the high-risk change that
earned two reviewers. Keeping every reviewer's output OUT of the lane means the lane holds only
reconciled verdicts, and evidence sitting newer than the last one is visibly unreconciled work.

Read the Codex findings before you write yours — an external reviewer with no stake in the design
sees things the project's own conventions can blind you to, and agreeing with it is not deference,
it is evidence.

**As the sole reviewer**, finish by applying exactly one of `review:pass` / `review:changes`,
removing the twin. A missing label fails the edit — say which; never silently drop it. **As one of
two, touch no label at all** — stamping `review:pass` from evidence would put the lane's own sticker
on a round that has not been reconciled yet, which is the failure this whole section prevents.

**Language: the project's, not yours by default.** Where the project's own instructions state a
language for what it writes to its tracker, write the PROSE in that language — a tracker read by
people who work in Portuguese should not fill up with English because the framework's skills happen
to be written in it. Absent any such statement, English.

**The structure is not prose and is never translated**: the `## 🔎 REVIEW` heading, the verdict word (pass / changes), its field names (PROBED, FINDINGS, TEST GUARDS BUG), the `review-verified:` / `review-changes-at:` markers and the `review:*` labels stay exactly as written — and so do the EVIDENCE headings `## 🔎 CODEX REVIEW` / `## 🔎 INTERNAL REVIEW` you post under when you are one of two reviewers, even though those carry no marker and no label. The gate finds unreconciled evidence by matching them: translate one and a newer finding becomes invisible, leaving a stale `review:pass` and its matching marker authoritative — which is a commit approved without the reconciliation this whole two-reviewer path exists to force. The commit gate MATCHES those literally — a translated heading is a verdict the gate cannot see, which is the failure SHA-binding exists to prevent, reintroduced through the front door.

## 6. Routing

`changes` goes back to the implement stage with your findings as the fix list. Something that needs
a product decision rather than a code fix goes to the product owner, not into a numbered list.
