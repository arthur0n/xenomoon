---
description: Chart a xeno-epic — product-owner (grill mode) names the goal, then a breadth-first sweep fills the frontier and fog via the epic tool; resolves nothing
argument-hint: "[the big/foggy brief — or an open epic ref to work its next decision]"
---

# /epic — chart or continue an epic

Load the `xeno-epic` skill and follow it.

- `$ARGUMENTS` is a **brief** → chart: dispatch the **`product-owner`** (foreground,
  grill mode) to name the goal, then run the breadth-first sweep and record everything
  through `mcp__ui__epic` (`chart`, then `open`/`fog`/`scope_out`). Charting resolves
  nothing; report the epic ref and its frontier.
- `$ARGUMENTS` is an **epic ref** (issue number or slug) → work it: `op:"next"`, route
  that ONE decision to its owning agent, record with `op:"decide"`, graduate fog.
- No arguments → `op:"list"`, then ask which epic (or offer to chart the topic under
  discussion).
