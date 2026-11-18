# CORE patterns — shared infrastructure every domain gets

These capabilities live in the spine (`ui/server/features/*` + `ui/server/mcp-tools/*`) and load into
**every** project session regardless of the bound domain. A domain pack's `orchestrator.md` can rely
on them without re-implementing them — document only the domain-specific twist, not the mechanics.
All per-project state lives under `<project>/.xenomoon/`, which install always gitignores (never
committed).

## Task board — `mcp__ui__tasks` → `.xenomoon/tasks.json`

A persistent, cross-session task list shown in the UI's right rail. Durable (survives a session
reset) — distinct from the per-turn ephemeral `TodoWrite`.

- **Item:** one discrete piece of work. `owner:"agent"` (your work, the default) or `owner:"user"`
  (a to-do for the human). `status`: `pending → in_progress → done`.
- **Ops:** `op:"add"` (a single `title` or a `tasks` batch) · `op:"update"` (advance `status`) ·
  `op:"remove"` · `op:"complete_open"` (close all open agent tasks).
- **Sub-agents self-close:** a spawned/background worker adds its own task and the server auto-closes
  it on finish — the orchestrator doesn't chase it.
- Tool: `ui/server/mcp-tools/task-tool.js` · store: `ui/server/features/tasks/tasks-store.js`.

## Promotions — `mcp__ui__promote` → `.xenomoon/promotions.json`

The self-improvement graduation path: a capability that started **project-local** (a skill, tool,
agent, or convention) and proved broadly useful gets _filed_ for promotion into the active domain
pack, so the next project inherits it.

- **File, don't move:** call `mcp__ui__promote { kind, name, reason }`. It only records a request on
  the board — **the human approves**; nothing graduates silently, and the model never moves files.
- **Default local:** keep capabilities project-local; promote deliberately, only when reusable.
- Tool: `ui/server/mcp-tools/promote-tool.js` · store: `promotions-store.js` · apply: `promote.js`.

## Autonomous mode — `.xenomoon/autonomous.json`

A standing Main Goal the hive self-drives toward across cycles (off by default). Tool:
`ui/server/mcp-tools/autonomous-tool.js`; conception in the `xenomoon:autonomous-main-goal` skill.

## Asking the user (foreground vs background)

Questions render as UI prompts, never plain chat:

- `AskUserQuestion` — yes/no or a quick pick.
- `mcp__ui__form` — typed / multi-field input; pauses until submitted.
- `mcp__ui__ask` — a question from background work; files it `owner:"user"`, returns immediately, and
  the answer is pushed back to the orchestrator as a turn.
- **One decision, one channel** — surface each decision exactly once.
- **`.claude/` writes are foreground + human-gated:** background the research to a single `ask` gate,
  then do the `.claude/` write in the foreground after approval.

## Convention floor — the project's `CLAUDE.md`

`forge new` seeds a `CLAUDE.md` "project facts" template into a freshly-bound project: the domain's
own template if the pack ships one (`domains/<name>/templates/CLAUDE.md`), else the CORE neutral
baseline (`plugin/templates/CLAUDE.md`). An existing `CLAUDE.md` is never overwritten. Its Commands /
Hard rules / Conventions sections are **authoritative** — agents obey them over their generic
defaults. A domain pack ships no baked-in floor; every project owns its own.
