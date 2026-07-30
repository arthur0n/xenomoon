---
name: grill
agents: [product-owner]
domain: universal
description: Grill the user — a relentless one-question-at-a-time interview that walks every branch of a slice's decision tree until shared understanding. Use when the user asks to be grilled (/grill, "grill me", "stress-test this plan"), or when a slice is high-stakes — schema migration, auth/permissions, money paths, destructive/irreversible operations.
---

# Grill mode — walk the decision tree

Grill mode replaces the default apply-recommendations interview with a **relentless**
one: every decision is put to the user, one at a time, until the whole decision tree is
resolved. It exists for the moments where a silently-applied default is more expensive
than the extra round-trips — the user asked for rigor, or the slice is high-stakes.

## The tree

1. **Map the branches first.** From the brief + repo, list the decisions this slice
   contains and their dependencies. This map is yours, working state — not shown as a
   wall of questions.
2. **One branch at a time, dependencies first.** Resolve a branch fully before opening
   the next. An answer may reshape the tree — re-derive the remaining branches after
   every answer, and drop branches the answer just closed.
3. **One question per round-trip.** Exactly ONE decision per `mcp__ui__form` (or per
   message outside the UI). Batched questions bewilder, and an early answer
   contaminates the later ones you already asked.

## Facts vs decisions

A **fact** the repo, library, or environment can answer — look it up; asking is a
defect even in grill mode. A **decision** — trade-off, preference, product intent — goes
to the user; in grill mode EVERY decision goes to the user, including ones you'd
normally apply silently.

## Every question carries your recommendation

Grilling is not abdication: each form is a read-only `note` framing the branch and why
it matters, then a `select` with your **recommended option first**, plus a
free-expression option. The user decides; you still do the thinking.

## Capture

Answers stating product intent go into the PRD's Business rules **verbatim**. Accepted
recommendations still land in the Applied-recommendations table — grill answers are the
audit trail, not chat exhaust.

## Stop condition

Grilling ends when BOTH hold: no unresolved branch remains, AND the slice meets the
bar — one builder, one task, one verify, one human look. Then confirm shared
understanding with ONE final summary form (the agreed shape in five lines or fewer,
yes/adjust). Only after that confirmation do you write the PRD. Ending on fuzzy
"seems agreed" is premature completion; ending the moment both conditions hold is
correct — grilling past shared understanding is form fatigue, not rigor.
