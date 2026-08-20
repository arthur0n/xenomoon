---
name: commit-method
agents: [orchestrator]
domain: universal
description: How the pipeline records a finished fix — what a commit must contain and must not, why the message carries `(#N)` and never `Closes #N`, what to do when the gate refuses, and why the design doc graduates in its own commit. Load when an issue is green and about to be committed, or when a commit was refused.
---

# The commit stage — recording a fix, once, honestly

Three things own this stage, and none replaces the others:

- **`issuekit commit <N> -m "…"` does it** — asks the gate, commits, then stamps the labels in the
  same call. Bookkeeping that lives in a separate step is bookkeeping that gets skipped.
- **The commit gate judges it** — deterministically, for any commit, including one typed by hand.
- **This skill is the method** — when a commit is earned, what belongs in it, what to do when it is
  refused.

You run this stage yourself. There is no agent: the work is already done and verified; what remains
is recording it.

## 1. A commit is earned, not asserted

Commit when the issue's own stages say so — QA passed, review passed, and both verdicts recorded the
SHA you are committing on. You do not need to re-run them: that is what the gate re-checks, at the
moment the commit runs, from the issue itself.

**Do not pre-judge the gate by reading labels.** A label is a cache of a verdict; the verdict is the
comment. Ask the tool and read what it says.

## 2. What the commit contains

**The issue's fix, and nothing else.** Check `git status --porcelain` before you stage: an unrelated
file in the tree means stop and say so, not stage it anyway. A commit that carries someone else's
work cannot be reverted as a unit, and the next reader will not know which change broke what.

**The message threads the commit to its issue:**

```
<type>: <imperative summary> (#N)

<root cause in one line — what was actually wrong>
<what the fix does about it>
Verified: <the project's gates> · regression test <name> · QA pass · review pass.
```

**`(#N)`, never `Closes #N`.** The reference is what the gate reads and what the label stamp keys
on. `Closes` hands closing to GitHub's merge, which is wrong here: an issue closes when the fix
**deploys**, not when it merges — that is what `fixed-pending-deploy` is for.

Follow the project's own message convention where it has one (`CLAUDE.md`); the `(#N)` rule is the
part that is not negotiable, because machinery depends on it.

## 3. When the gate refuses

The refusal names the failing condition. Route on it rather than working around it:

- **a stale verdict** (`qa-verified` at a different SHA) → the code moved; re-run that stage
- **a newer blocking verdict** → back to the implement stage with its findings
- **unreconciled reviewer evidence** → `audit` again, so one reconciled verdict exists
- **no pipeline state** → the gate is asking whether this project runs this pipeline at all. That
  is a question about the PROJECT, and it is not yours to answer. **Stop and put it to the human**,
  with what you found (which labels and verdicts exist, which do not). Do not retry the commit until
  they have answered.

**Every refusal ends one of two ways: you route to the named upstream stage, or you stop and hand it
to the human. There is no third way.** Not rephrasing the command, not staging differently, not
committing without the reference so the gate stops matching. A gate you talked your way past
protects nothing, and the next person cannot tell it was bypassed.

**`--force` exists, and it is not for you.** It overrides an ASK only, never a DENY, and it requires
a written reason that is posted to the issue before the commit lands — so an override is a decision
someone signed, findable later. Reach for it when the human has told you to; not to get unstuck.

## 4. Never push

Push is the human's checkpoint — the one place a person decides that this goes out. The commit is
automatic once green; the push is not, and no agent performs it.

## 5. The design doc graduates separately

If the issue carried a PRD, move its durable facts into the project's own library and archive the
doc **in its own commit, after the fix's** — human-gated, since it changes what the project treats
as settled. Keeping it out of the fix commit is the same "nothing unrelated" rule: the fix must
stay revertable on its own.

## 6. Report

The sha, the subject, the labels applied, and — explicitly — that nothing was pushed. If the labels
did not land, say so loudly: the deploy workflow closes issues on `fixed-pending-deploy`, so a fix
that ships without it stays open forever, and someone will eventually re-fix it.
