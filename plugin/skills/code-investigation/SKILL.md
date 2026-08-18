---
name: code-investigation
agents: [junior-analyst, senior-analyst]
domain: universal
description: The shared discipline for any read-only investigation of a defect — falsify a cause before accepting it, cite only path:line you actually opened, use git archaeology when a symptom smells like a regression, and rate confidence honestly. Load whenever you must state WHY something broke — triage, fix design, or review.
---

# Investigating a defect — the discipline

A confident-but-wrong root cause is worse than an admitted unknown: it ships a fix that gets
reverted, and the real bug survives with a closed issue on top of it. Everything here exists to
make that outcome hard.

## Falsify before you accept

You will form a hypothesis quickly. Before you commit to it, actively try to **disprove** it:

- If this were the cause, **what else must be true?** Check that, don't assume it.
- Does the **known-good** code — the pre-regression version, or a sibling path that works —
  share the same pattern? **If it does, your cause is wrong.** That check alone kills most
  plausible-but-false causes.
- Can you point at the exact line where behaviour diverges from intent? If not, you have a
  suspicion, not a cause. Say so.

State the outcome as one of:

- **CONFIRMED** — traced end-to-end in code, and the obvious alternative is ruled out.
- **REFINED** — the reported area is roughly right, the precise cause or location differs. State
  the correction.
- **WRONG (reframed)** — the obvious reading misdiagnoses it. State the real cause with evidence.

## Evidence rules

- **Cite only `path:line` you actually opened.** Never infer a line number, never reconstruct a
  path from memory or from a name that "should" exist. An invented citation is worse than none —
  the next stage trusts it and builds on air.
- Quote error text **verbatim**. Paraphrased errors lose the token that identifies them.
- Distinguish what you **read** from what you **ran**. "The handler returns early on `null`" is a
  code fact; "the request 500s" is an observation — don't blur them.
- Trace far enough to be concrete: the call path from entry point to the divergence, not just the
  file that "looks related".

## When it smells like a regression

It worked before and broke recently — the history is evidence, so read it:

```bash
git log --oneline -15                 # what landed lately
git log -S"<symbol>" -- <path>        # when this symbol's usage changed
git blame -L <start>,<end> -- <path>  # who last touched the suspect lines
```

Then answer the question that matters: did that commit **introduce** the bug, or merely
**surface** a latent one (an error that used to be swallowed now propagates, a timing window that
widened)? Say which — the fix differs, and "surfaced" means the real defect predates the commit
everyone is about to revert.

## Confidence, honestly

Rate `high` / `medium` / `low`, and reserve **high** for a cause traced end-to-end in code whose
obvious alternative you ruled out. A runtime, layout or timing cause you cannot confirm
statically is **medium at most** — no matter how sure it feels. Uncertain → say so and lower the
rating; nobody is harmed by an honest `medium`, and everybody is harmed by a false `high`.

## Scope

Investigate only far enough to settle the cause. Do not wander the codebase, do not fix anything,
do not refactor what you read. Something else is broken → note it in one line for its own issue,
and carry on with the one you were given.
