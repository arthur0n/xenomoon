---
description: Grill me — dispatch the product-owner in grill mode; a relentless one-question-at-a-time interview that walks the plan's decision tree until shared understanding, then (and only then) the PRD
argument-hint: "[the plan / brief / decision to grill — or empty to grill the topic under discussion]"
---

# /grill — relentless interview

Dispatch ONE **`product-owner`** agent (opus, **foreground only — never background**;
it round-trips `mcp__ui__form` with the user) on the topic in `$ARGUMENTS` — or, with no
arguments, on the brief currently under discussion (pass it verbatim, plus any decisions
already settled this session so it never re-asks them).

Tell it: **run in grill mode** (its `grill` skill) — every decision to the user, one
question per round-trip, recommendation first, until the decision tree is resolved and
the user confirms shared understanding. Its normal PRD contract is unchanged: the doc
lands in `design/<slug>.md` only after that confirmation.

Relay its handoff (doc path, ordered slices, open questions) unchanged.
