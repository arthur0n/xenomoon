---
name: qa-method
agents: [tester]
domain: universal
description: The tester's method in the Build, Review and Fix steps — re-run the project's own checks for every package the change touches, judge the test the design named (it exists, runs the bug's path, would be red before the change), and, when the brief asks for the pass, post the SHA-bound `## 🧪 QA — PASS | BLOCKED` comment with the content fingerprint. Load for a per-piece check, the pass at Review, or a re-check after a fix round.
---

# QA — the method

The route, the stops and the counters come from the flow checklist named in the brief
(`plugin/docs/flow/build.md`, `review.md` or `fix.md`). This skill is the method. When the two
disagree on route or stops, the checklist decides.

A green build is not a pass: the load-bearing check is whether the bug can come back unnoticed.

## 0. Which moment

- **After a piece in Build** → §2 and §3 for the packages the piece touched, then mark the piece
  finished. No comment, no label: report the result to your caller.
- **The pass at Review, or a re-check after a fix round** → the whole method, ending in §5. Run it
  whenever the brief asks, even when an earlier comment says PASS at the same HEAD: after a fix HEAD
  does not move, and the earlier verdict covers other content.

Read the newest QA comment for context (`issuekit show <N> --digest --lane qa`); it is the verdict,
the labels are a summary of it that can go stale.

## 1. What the pass does

The commit gate allows a commit only on `qa:pass` plus a `qa-verified:` marker at HEAD in the newest
QA comment, and projects wire their deploy to `qa:pass`. A pass on a red check or a missing test
ships it.

## 2. Read the design and find the change

Read the issue, the `## 🔬 ANALYSIS` design (its **TESTABILITY** field names the test that must
exist), the Plan piece, and the developer's report. Then the change itself: `git status --porcelain`,
`git diff --stat`, `git diff`; separate changed **source** from changed **tests**.

The change is the **uncommitted working tree**. A clean tree, or one holding nothing related, is a
BLOCK: say the Build step left no change.

For what else the change can break, `graphify affected "<changed-file>"`, not a text search.

## 3. Re-run the project's checks — every package the change touches

Use **this project's own commands** (its `CLAUDE.md` command list), never assumed ones, and never a
bare compiler binary. Do not skip a touched package because another one passed.

- **validate** (type-check + lint at zero warnings + unit tests)
- **build**
- **test**, when the project separates it from validate
- **smoke / integration** — required when the change touches a data path (scoping, transactions, a
  read/write). Skip only when the design's SHIP/TESTABILITY make clear there is no data path.

Any red → BLOCKED. Do not weaken, skip, or `--if-present`-dodge a failing check, and never report a
run you did not execute.

## 4. Judge the test the design named

- It must **exist**: find the file and the test name TESTABILITY promised.
- It must **exercise the bug's path**: read it, don't count it. A test that passes without touching
  the changed code guards nothing.
- It would have been **red before the change**: reason it through from the design's cause. If you
  cannot establish that statically, say so rather than implying it.
- The only allowed absence is a design that **explicitly** marked it not automatable.

Missing test, or a test that guards nothing → **BLOCKED**, however green the commands were.

**When the issue links a PRD**, its **Acceptance** block is your rubric, unchanged: the developer
built against the same text.

## 5. The comment

Terse, one line per field. Write to a temp file and post it.

```
## 🧪 QA — PASS | BLOCKED

**GATES:** validate <ok/fail> · build <ok/fail> · test <ok/fail> · smoke <ok/fail/n-a>
**REGRESSION TEST:** <path::name> — <guards the bug: yes/no + one line how> | not-automatable per spec
**TREE:** <holds the change / clean / unrelated changes>
**CONTENT:** <output of: git diff HEAD | shasum>
**BLOCKERS:** <only when BLOCKED — each failing check or the missing/weak test, one line each>

---
*QA gate · tester · <output of: git rev-parse --short HEAD>*
qa-verified: <output of: git rev-parse HEAD>      ← PASS ONLY
```

**The marker depends on the verdict:**

- **PASS** → last line is `qa-verified: <full sha>`.
- **BLOCKED** → last line is `qa-blocked-at: <full sha>` instead. **Never emit `qa-verified:` on a
  BLOCKED verdict.**

The commit gate reads `qa-verified:` as proof this code passed. If a BLOCKED comment carried it, a
failed label edit beside a stale `qa:pass` would let a blocked change commit. `qa-blocked-at:`
records which code you judged and carries no authority at the gate.

**CONTENT** is the fingerprint the Commit step compares before staging: HEAD does not move during
Build and Fix, the content does.

**Label BEFORE you post when the verdict is BLOCKED.** The label is the block; the comment is the
explanation, so an interrupted run leaves the issue blocked, not explained-but-unblocked.

Then label: exactly one of `qa:pass` / `qa:blocked`, removing the twin. A label that does not exist
fails the edit — say which one; never silently drop it.

**Language: the project's.** Where the project's own instructions state a language for its tracker,
write the PROSE in it; otherwise English. The `## 🧪 QA` heading, the verdict word (PASS / BLOCKED),
the field names, the `qa-verified:` / `qa-blocked-at:` markers and the `qa:*` labels stay as
written: the commit gate matches them literally, and a translated heading is a verdict it cannot see.

On BLOCKED, your blockers are the fix list; say so in your return.
