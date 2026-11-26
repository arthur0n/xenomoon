---
name: adversarial-review
agents: [senior-analyst]
domain: universal
description: The method of the fallback reviewer in the Review step (a fresh senior-analyst when Codex is not enabled), of the re-read after a fix round, and of posting Codex's receipt as the review comment — answer every attack of the fixed list in plugin/docs/flow/review.md, a finding only with a concrete hole at path:line, and write the `## 🔎 REVIEW — pass | changes` verdict + review:* labels with a PASS-only SHA marker when the brief asks for it. Load when reviewing a change in the flow.
---

# Adversarial review — try to break it on paper

The route, the stops and the counters come from the flow checklist named in the brief
(`plugin/docs/flow/review.md` or `fix.md`). This skill is the method. When the two disagree on route
or stops, the checklist decides.

Your job is **not** to confirm the change looks reasonable; it is to hunt for the way it is wrong,
and to say honestly whether you found one. You read the **actual diff**, not its description.

## 0. Which mode

- **The full review** (Review step) → §1 to §4 on the whole change. Run it whenever the brief
  asks; an earlier verdict at the same HEAD covers other content.
- **The re-read after a fix round** → read only the fix and the code it affects (the callers of what
  changed, from `graphify affected "<file>"`). Answer two questions per open finding: is it closed,
  and did the fix break something? Then §4.
- **Posting Codex's answer** (the brief hands you a Codex receipt) → do not review. Go to §4 and
  write the comment from the receipt as given: its findings, its verdict mapped to `pass` or
  `changes`, the fingerprint and the marker. Add no finding and drop none.

Context: `issuekit show <N> --digest --lane review` prints the newest `## 🔎 REVIEW —` comment.

## 1. Read what you are judging

The contract (issue body), the `## 🔬 ANALYSIS` design, the QA comment if one exists, then the
change: `git status --porcelain && git diff && git diff --staged`. Read every hunk. For what the
change affects, `graphify affected "<file>"`, not a text search.

## 2. The project's own rules come first

Judge against **this project's floor** before general doubts: its `CLAUDE.md` Hard rules and the
convention docs its Conventions index points to, its `domain-conventions` skill if the pack ships
one, and any local rule the repo states. A change clean in the abstract that breaks the project's
own convention is a finding.

## 3. The attacks

The attacks are the fixed numbered list in `plugin/docs/flow/review.md` ("The fixed list of
attacks"). Answer every one: a finding, or "tried, nothing".

- A finding names `path:line` and a concrete consequence. Unease is not a finding; a matter of
  taste is not a finding; what a tool already checks is not reviewed.
- For every finding answer **"did this change cause it, expose it or make it worse?"** with the
  evidence. Yes → it is a finding to fix. No → one line for the owner's list: no fix, no new issue.

## 4. Write-back

```
## 🔎 REVIEW — pass | changes

**PROBED:** <each attack number: finding | tried, nothing>
**FINDINGS:**
- `path:line` — <concrete hole + consequence> | none
**OWNER'S LIST:** <findings this change did not cause, one line each> | none
**TEST GUARDS BUG:** yes | no — <one line>
**CONTENT:** <output of: git diff HEAD | shasum>

---
*adversarial review · senior-analyst · <output of: git rev-parse --short HEAD>*
review-verified: <output of: git rev-parse HEAD>      ← PASS ONLY
```

`pass` when no finding is left to fix; `changes` otherwise. Write `pass`, never another word: the
gate reads an unknown verdict word as unreadable and asks.

**The marker depends on the verdict:** a `pass` ends with `review-verified: <full sha>`; a `changes`
ends with `review-changes-at: <full sha>` and **never** carries `review-verified:`. The commit gate
reads `review-verified:` as proof this code was reviewed; on a blocking verdict it would let one
failed label edit beside a stale `review:pass` commit a rejected change.

**On a `changes` verdict, label BEFORE posting.** The label is the block; the comment only explains
it.

Then apply exactly one of `review:pass` / `review:changes`, removing the twin. A missing label fails
the edit — say which; never silently drop it.

There is one reviewer and one `## 🔎 REVIEW` comment, and you write it: from your own review, or
from the Codex receipt the brief hands you. Post nothing under `## 🔎 CODEX REVIEW` or
`## 🔎 INTERNAL REVIEW`: such a comment newer than the lane verdict makes the commit gate ask.

**Language: the project's.** Where the project's own instructions state a language for its tracker,
write the PROSE in it; otherwise English. The `## 🔎 REVIEW` heading, the verdict word (pass /
changes), the field names, the `review-verified:` / `review-changes-at:` markers and the `review:*`
labels stay as written: the commit gate matches them literally, and a translated heading is a
verdict it cannot see.
