---
name: qa-method
agents: [tester]
domain: universal
description: The QA gate's method — re-run the project's own gates for every package the diff touches, assert the regression test the spec named EXISTS and actually guards the bug, and post a SHA-bound PASS/BLOCKED verdict. Load when QA-ing an implemented issue.
---

# QA — the method

You are the gate, not a second opinion. A green build is not a pass: the load-bearing check is
whether the bug can come back unnoticed.

## 0. Gate — the NEWEST verdict decides, and it is a comment, not a label

Capture `git rev-parse HEAD`, then read **the newest comment in the QA lane** — the last one whose
header is `## 🧪 QA —`. That comment is the verdict; labels are a summary of it that can go stale
(a comment posts, its label edit fails, and the issue reads green while the verdict says otherwise).

```bash
gh issue view <N> -R <repo> --json comments -q '[.comments[].body | select(test("🧪 QA —"))] | last'
```

- Newest verdict is **PASS** and its `qa-verified: <sha>` equals HEAD → post nothing, report
  `already QA'd at <short sha> — skipped`.
- Newest verdict is **BLOCKED** → route back to the implement stage, unforced, **whatever the
  labels say**. A `qa:pass` label sitting next to a newer block means an edit failed, not that the
  fix recovered — and treating the label as truth is how a blocked fix gets nudged forward.
- Newest verdict is a **PASS at a different SHA**, or there is no verdict → **QA it now**,
  unforced. The code moved under the pass; a pass earned on other code is not a pass on this one.
- `--force` re-runs regardless.

No `implemented` label → stop and say the issue needs implementing first.

## 1. What your verdict does — read this once

**Your label is the deploy switch.** Projects wire their deploy workflow to refuse any commit
referencing `(#N)` unless issue N is `qa:pass` and not `qa:blocked`. So `qa:pass` on a red gate, or
on a missing regression test, doesn't just misreport — it ships. Treat the label as the act it is.

## 2. Read the spec and find the change

Read the issue, the `## 🔬 ANALYSIS` spec (its **TESTABILITY** field names the test that must
exist), and the implementer's report. Then find the change itself — `git status --porcelain`,
`git diff --stat`, `git diff` — and separate changed **source** from changed **tests**.

QA runs against the **uncommitted working tree** the implement stage left. A clean tree, or one
holding nothing related, is a BLOCK: say the implement stage left no change.

For blast radius, ask the graph rather than grepping: `graphify affected "<changed-file>"` names
what else the change can break, which is where a missing regression test usually hides.

## 3. Re-run the project's gates — every package the diff touches

Use **this project's own commands** (its `CLAUDE.md` command list), never assumed ones, and never a
bare compiler binary. Do not skip a touched package because another one passed.

- **validate** (type-check + lint at zero warnings + unit tests)
- **build**
- **test**, when the project separates it from validate
- **smoke / integration** — required when the fix touches a data path (scoping, transactions, a
  read/write). Skip only when the spec's SHIP/TESTABILITY make clear there is no data path.

Any red → BLOCKED. Do not weaken, skip, or `--if-present`-dodge a failing gate to reach a pass, and
never report a run you did not execute.

## 4. Assert the regression test EXISTS and GUARDS the bug

This is why the stage exists; everything above is table stakes.

- It must **exist** — find the file and the test name the spec's TESTABILITY field promised.
- It must **exercise the bug's path** — read it, don't count it. A test that passes without
  touching the fixed code guards nothing.
- Sanity it against the cause: would it have been **red before the fix**? Reason it through from
  the spec's REAL CAUSE. If you cannot establish that statically, say so rather than implying it.
- The only allowed absence is a spec that **explicitly** marked the bug not-automatable.

Missing test, or a test that guards nothing → **BLOCKED**, however green the commands were.

**When the issue links a PRD**, its **Acceptance** block is your rubric — consumed UNCHANGED, the
same text the implementer built against. Re-interpreting it is how the judge and the generator
drift apart.

## 5. Write-back

Terse, scannable, one line per field. Write to a temp file and post it.

```
## 🧪 QA — PASS | BLOCKED

**GATES:** validate <ok/fail> · build <ok/fail> · test <ok/fail> · smoke <ok/fail/n-a>
**REGRESSION TEST:** <path::name> — <guards the bug: yes/no + one line how> | not-automatable per spec
**TREE:** <holds the fix / clean / unrelated changes>
**BLOCKERS:** <only when BLOCKED — each failing gate or the missing/weak test, one line each>

---
*QA gate · tester · <output of: git rev-parse --short HEAD>*
qa-verified: <output of: git rev-parse HEAD>      ← PASS ONLY
```

**The marker depends on the verdict, and this is a safety property, not bookkeeping:**

- **PASS** → last line is `qa-verified: <full sha>`.
- **BLOCKED** → last line is `qa-blocked-at: <full sha>` instead. **Never emit `qa-verified:` on a
  BLOCKED verdict.**

`qa-verified:` is what the commit gate reads as proof this code passed. If a BLOCKED comment also
carried it, one partial failure would be enough to ship a blocked fix: the comment posts, the label
edit then fails (a missing label, a `gh` hiccup) leaving a stale `qa:pass` from an earlier run, and
the gate would see `qa:pass` + a matching newest `qa-verified` at HEAD and allow the commit QA had
just refused. Distinct markers make that impossible rather than unlikely.

`qa-blocked-at:` still records which code you judged, so a re-run at the same SHA is recognisable —
it simply carries no authority at the gate.

**Label BEFORE you post when the verdict is BLOCKED.** The label is the block; the comment is the
explanation. Doing it in that order means an interrupted run leaves the issue blocked-without-detail
rather than explained-but-unblocked.

**Race backstop:** re-check the labels immediately before writing. If a verdict appeared while you
were running and this is not a forced run, post nothing and say so — only the first finisher writes.

Then label: exactly one of `qa:pass` / `qa:blocked`, removing the twin. A label that does not exist
fails the edit — say which one; never silently drop it.

## 6. BLOCKED routes back

A `qa:blocked` verdict sends the issue back to the implement stage, and your blockers are the fix
list. Say that in your return so the caller knows the next move without re-reading the thread.
