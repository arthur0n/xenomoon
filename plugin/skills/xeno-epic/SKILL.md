---
name: xeno-epic
agents: [orchestrator, product-owner]
domain: universal
description: Epic — the durable decision container for an effort bigger than one slice. Use when a brief spans more than one PRD/slice or more than one session, when the user says "epic", "/epic", "chart this", "this is big", or when an open epic exists for the work at hand (check mcp__ui__epic op:"list").
---

# Xeno-epic — a tiny wayfinder

An **epic** holds what evaporates between sessions of a big effort: the goal, the
decisions made, the open decisions (the frontier), the fog (questions not yet
phrasable), and what was ruled out. It is a small container in the scrum sense — most
work is incremental, not an expedition. **All writes go through `mcp__ui__epic`** — the
tool owns the body shape; an epic is never edited freehand. (Storage — project tracker
issue labelled `epic`, or `design/epics/` fallback — is the tool's concern, not yours.)

## When an epic is warranted (orchestrator's call)

Chart one when the brief needs **more than one slice or more than one session** —
otherwise route straight to the normal pipeline. A single PRD with a "Later" list is
NOT an epic. When work arrives, `op:"list"` tells you if it belongs to an open epic.

## Charting (birth)

The product-owner names the goal — grill mode, since an epic is by definition
high-stakes scope. Then a **breadth-first** pass over the space (wide, not deep): sharp
questions → `op:"open"`, dim ones → `op:"fog"`, ruled-out work → `op:"scope_out"`.
Charting ends there — it resolves nothing.

## Working (each session)

1. `op:"status"` — orient. `op:"next"` — the frontier's first open decision (or the
   user names one).
2. Route the decision to its **owning agent** by nature:
   - intent / trade-off / scope → **product-owner** (grill mode, foreground)
   - knowledge outside the repo → **researcher** (or Hermes when enabled) — these may
     run in parallel, backgrounded
   - work that must happen before deciding (provision, move data) → the domain builder,
     or a human checklist via form
3. The resolver reports back; **you** record: `op:"decide"` (answer verbatim where it
   is user intent; `link` to the PRD/report holding the detail). Graduate any fog the
   answer sharpened: `op:"open"` with `from_fog`.
4. **One decision per session** (parallel research excepted). Build work discovered on
   the way exits to the normal pipeline as a slice — `op:"slice"` links it.

## The fog test

Ticket-or-fog is decided by whether the QUESTION is phrasable sharply now — not
whether it's answerable now. Sharp → `open`. Dim → `fog`, coarse as the view allows.
Beyond-the-goal → `scope_out`, never fog.

## Done

The epic is done when the frontier is clear (`next` returns none) and remaining fog is
empty or scoped out: the route is the slice list, executed by the normal pipeline.
Durable product rules discovered along the way follow the standard path into the
project library (product-owner, human-gated); the epic closes with the last slice.
