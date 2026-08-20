---
name: pre-pr-review
agents: [senior-analyst]
domain: universal
description: The fresh look before the PR, AFTER QA — judge what was actually built against what was designed, name what the chain silently dropped, and say whether this is coherent as one PR. Not a re-run of the adversarial review. Load when a change has passed QA and is about to become a pull request.
---

# Pre-PR review — did we build what we set out to build?

Every earlier stage judged the change against **the stage before it**: the implementer against the
spec, the sweep against the gates, the adversarial pass against the diff, QA against the tests. All
of them can pass while the delivery still misses the point — because nobody re-read the **design**
with the finished work in hand.

That is this lane. It runs **after QA**, with fresh eyes, and it asks one question: _does what was
built actually deliver what was agreed, and is it ready to be one pull request?_

You are read-only. You do not fix, and you do not re-run the gates — QA already did.

## 1. Read the design first, the diff second

Deliberately in that order. Read the issue, the PRD or `## 🔬 ANALYSIS` spec and its Acceptance,
and the decisions recorded in the thread — **before** the code, so the design frames the reading
rather than the code framing the design. Reading the diff first is how a reviewer ends up
confirming what was built instead of checking what was asked.

Then read the finished change as a whole: `git diff` against the base, not hunk by hunk.

## 2. The four questions

1. **Acceptance** — does every stated assertion actually hold in the built change? Name the ones
   you verified and how. An Acceptance line nobody can point at in the code is not delivered.
2. **What was dropped** — a caveat the spec named, a WATCH item, a follow-up someone said they
   would do, an edge case the thread discussed and the diff ignores. **This is the finding this
   lane exists for**: the chain loses things quietly between stages, and each stage assumed another
   one caught it.
3. **What was added** — anything in the diff that the design never asked for. Not necessarily
   wrong, but it must be named, because it has been reviewed against nothing.
4. **Coherent as ONE PR** — does the change tell a single story? A migration without its code, a
   rename tangled with a behaviour fix, two unrelated fixes riding together: each is a PR that
   cannot be reviewed or reverted as a unit.

## 3. Ship readiness

- **Deploy path** — what has to happen for this to be live, stated in one line, taken from the
  spec's SHIP field and confirmed against the diff.
- **Migration ordering** — if a schema change rides along, does it apply cleanly before the code
  that needs it.
- **Anything the human must know before merging** — a manual step, a config value, a follow-up
  issue to file.

## 4. Verdict

```
## 🚦 PRE-PR — ready | not-ready

**DELIVERS:** <acceptance assertions verified — one line each>
**DROPPED:** <what the chain lost, or "nothing found">
**UNASKED:** <in the diff but not in the design, or "nothing">
**COHERENT AS ONE PR:** yes | no — <one line>
**BEFORE MERGE:** <deploy path · migration order · anything the human must do>

---
*pre-PR review · senior-analyst · <output of: git rev-parse --short HEAD>*
```

**No new gate label** — this lane adds judgement, not another sticker to collect, and the pipeline's
gate-depth rules let a small change skip it entirely. `not-ready` routes back to the implement stage
(or to the product owner when the gap is a decision, not code), and says which.

**But `not-ready` is not advisory.** Where the commit gate ships with this pipeline, it reads the
newest `## 🚦 PRE-PR —` comment and denies the commit while that verdict stands — asymmetric on
purpose: a `ready` is never _required_ (you may not have run), while a `not-ready` you _did_ write
blocks until it is answered and the lane is re-run. So write `not-ready` only for a gap you can
name, and write it in the header exactly — the header IS the verdict the gate reads.

## 5. What this lane is NOT

- **Not the adversarial review.** That already hunted for how the code is wrong. Repeating it here
  wastes the fresh perspective; if you find a code defect anyway, report it plainly and note that
  the adversarial pass missed it — that is a signal about the pipeline, not just this change.
- **Not a re-run of the gates.** QA owns that.
- **Not a place to redesign.** A better idea that was not asked for is a new slice, and saying so
  is the correct output.

**Language: the project's, not yours by default.** Where the project's own instructions state a
language for what it writes to its tracker, write the PROSE in that language. Absent any such
statement, English.

**The structure is never translated**: the `## 🚦 PRE-PR — ready | not-ready` heading, its field names (DELIVERS, DROPPED, UNASKED, COHERENT AS ONE PR, BEFORE MERGE) AND the lane's signature footer stay exactly as written — the commit gate requires BOTH before a `not-ready` counts, so translating either silently unblocks a delivery nobody cleared. The verdict values `ready` / `not-ready` are routed literals as well — the dispatcher matches them exactly. A translated heading or label is a record the
gates and queues cannot see — literal matching is how every stage after this one finds your work.
