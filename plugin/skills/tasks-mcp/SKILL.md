---
name: tasks-mcp
agents: [workers]
domain: universal
description: Use mcp__ui__tasks as your plan and scratchpad inside any agent run — the PLAN → EXECUTE → VERIFY protocol. Decompose the brief into a real task list (3-8 tasks, never one umbrella task) BEFORE acting, update per step as you work, verify the brief is fully covered, then close out in one call (op complete_open). Visible in the UI right rail and persistent across sessions.
metadata:
  type: utility
---

# Tasks MCP — Plan & Scratchpad

`mcp__ui__tasks` is a persistent task board (`.xenomoon/tasks.json`, shown in the UI right rail).
Calling it never pauses the session — call it freely between other tool calls. **Every result
lists the tasks still OPEN (with their ids)** — read it to see what's left and to get the `id`
you need for `update`/`remove`.

**Every run has three phases — PLAN → EXECUTE → VERIFY:**

1. **PLAN — before your first file read or tool action:** decompose the brief into the REAL
   step list (typically 3–8 tasks) and batch `op:"add"` them. ONE umbrella task for a
   multi-step brief is a protocol violation, not a style choice — the board is where the
   human watches your plan and your progress.
2. **EXECUTE:** one `in_progress` at a time; `done` the moment a step finishes. A step you
   discover mid-run is ADDED to the board before you do it — never silently done off-book;
   a step that turns out unneeded is `remove`d with the reason in its `note`.
3. **VERIFY — before any handoff or return:** re-read the brief against the board. Every
   requirement covered by a `done` task? Anything missed becomes a task NOW — do it, or
   report it open in your receipt. Only after this pass do you close out (below).

```jsonc
{ "op": "add", "tasks": [ { "title": "Build scene", "owner": "agent" } ] } // batch at start
{ "op": "update", "id": "t3", "status": "in_progress", "note": "scratchpad" } // by id, from the OPEN list
{ "op": "update", "id": "t3", "status": "done" }
{ "op": "remove", "id": "t3" }                                               // step turned out unneeded
{ "op": "complete_open" }                                                    // close ALL your open tasks at once
```

- **`update`/`remove` target a task by `id`** (e.g. `t3`), NOT by title. The id comes from the
  add result / the OPEN list in every tool result. (Updating by title silently does nothing.)
- `owner`: `"agent"` (default), or `"user"` only for things the human must supply (an asset, a
  decision) — `user` tasks surface in the task / Get Assets modal. `note` is free-text scratchpad.

## Self-gate (after the VERIFY pass) — mandatory

The last thing you do before calling a handoff tool or ending your run — AFTER the
verify pass above, never instead of it:

```jsonc
{ "op": "complete_open" } // marks every task you own done, in one call
```

Then check the result: it must show **no OPEN tasks** of yours. `complete_open` is idempotent and
needs no ids — one call closes your whole scratchpad, so closing can never be half-done. (The
server also closes your tasks automatically when your run finishes, but call `complete_open`
yourself so the board is clean the instant you hand off, not a moment later.) Prefer one
`in_progress` task at a time and mark steps `done` as they finish, so the live board reflects
your real progress.
