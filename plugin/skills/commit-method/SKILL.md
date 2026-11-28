---
name: commit-method
agents: [orchestrator]
domain: universal
description: The method of the Commit step — the hook compares the content fingerprint with the two pass comments, stage first, what a commit must contain and must not, why the message carries `(#N)` and never `Closes #N`, what to do when the gate refuses, and why the design doc stays out of the fix commit. Load when an issue has its pass and is about to be committed, or when a commit was refused.
---

# The Commit step — recording a change, once, honestly

The route and the stops come from `plugin/docs/flow/commit.md`. This skill is the method. When the
two disagree on route or stops, the checklist decides.

Three things own this stage, and none replaces the others:

- **`issuekit commit <N> -m "…"` does it** — asks the gate, commits, then stamps the labels in the
  same call. Bookkeeping that lives in a separate step is bookkeeping that gets skipped.
  As everywhere, `issuekit` means **the shipped path your prompt names** — a bare one on PATH may be
  an older copy with no `commit` verb at all.
- **The commit gate judges it** — deterministically, for any commit, including one typed by hand.
- **This skill is the method** — when a commit is earned, what belongs in it, what to do when it is
  refused.

You run this stage yourself. There is no agent: the work is already done and verified; what remains
is recording it.

## 1. A commit is earned, not asserted

Commit when QA and review passed and both verdicts recorded the SHA you are committing on. You do
not re-run them: the gate re-checks them, at the moment the commit runs, from the issue itself.

HEAD does not move during Build and Fix, so the gate also compares the content. The hook compares the
fingerprint of the working tree (`issuekit fingerprint`) with the `qa-content:` and `review-content:`
marks of the two pass comments. Different → the hook denies the commit, cancels the pass and moves
the issue to Fix. Equal but something is not staged → the hook asks the human, because the commit
would not record what the pass saw.

Stage everything first, then give the commit in a command of its own. The hook compares when the
command is given, not at the end of it; what a project's own pre-commit hooks change is not compared.

In a terminal session, the owner's word before the commit. In a project session, none.

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
on. `Closes` hands closing to GitHub's merge; only the Proof step closes an issue.

Follow the project's own message convention where it has one (`CLAUDE.md`); the `(#N)` rule is the
part that is not negotiable, because machinery depends on it.

## 3. When the gate refuses

The refusal names the failing condition. Route on it rather than working around it:

- **a stale verdict** (`qa-verified` at a different SHA) → the code moved; back to Fix for a re-check
- **a content mark that differs from the working tree** → the pass is cancelled and the hook has
  already moved the issue to Fix; the round is counted by the hook (once per refused content)
- **a newer blocking verdict** → back to Fix with its findings
- **no pipeline state** → the gate is asking whether this project runs this pipeline at all. That
  is a question about the PROJECT, and it is not yours to answer. **Stop and put it to the human**,
  with what you found (which labels and verdicts exist, which do not). Do not retry the commit until
  they have answered.

**Every refusal ends one of two ways: you go to the step it names, or you stop and hand it
to the human. There is no third way.** Not rephrasing the command, not staging differently, not
committing without the reference so the gate stops matching. A gate you talked your way past
protects nothing, and the next person cannot tell it was bypassed.

**`--force` exists, and it is not for you.** It overrides an ASK only, never a DENY, and it requires
a written reason that is posted to the issue before the commit lands — so an override is a decision
someone signed, findable later. Reach for it when the human has told you to; not to get unstuck.

## 4. The Commit step does not publish

Publishing is the Publish step's: `senior-analyst` running `push-method`, never the author. Never
commit while a builder works on the same tree.

## 5. The design doc is not part of the path of an issue

If the issue carried a PRD, nothing is archived here and no second commit follows. Moving its
durable facts into the project's library is separate work, done only when the owner asks for it.
Note it as one line on the owner's list. It never goes into the fix commit: the fix must stay
revertable on its own.

## 6. Report

The sha, the subject, the labels applied, and that nothing was pushed. If a label did not land, say
so loudly: the stamp (`committed`, `fixed-pending-deploy`) is what the project's deploy workflow and
the next reader key on, and a missing one leaves the issue looking unfixed.

**Language: the project's, not yours by default.** Where the project's own instructions state a
language for what it writes to its tracker, write the PROSE in that language. Absent any such
statement, English.

**The structure is never translated**: every label this step stamps (`committed`, `fixed-pending-deploy`, and the deploy-gate labels) stays exactly as written, and so does the `(#N)` issue reference in the commit message — the commit gate and the label stamp both parse it to find the issue at all. A translated heading or label is a record the
gates and queues cannot see — literal matching is how every step after this one finds your work.
