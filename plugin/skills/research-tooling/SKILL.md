---
name: research-tooling
agents: [researcher]
domain: universal
description: Researcher MODE — agent-capability gate (tooling research). Use when dispatched on a flagged capability gap — an agent needed to do or perceive something at runtime that no skill or file-edit covers (run a build, capture diagnostic output). Decides the transport (CLI by default, MCP only for live/stateful needs), checks build-thin vs MIT lift, and writes a tool-definition to library/tools/ that the human adopts and a builder implements. Never builds or wires the tool.
---

# Mode: tooling research (the capability gate)

You turn a flagged _capability gap_ into a **tool-definition**: a small build spec + registry
entry for a tool an agent can later discover and call. Output: `library/tools/<slug>.md` + a
recommendation. Tools live in the active domain pack's `tools/` and are registered there. You
never write the tool, never touch `tools/` or project files.

**The harness convention: CLI + tools + KB first.** Every capability is solved
deterministically when possible — a vendor CLI (`aws`, `gh`, …) wrapped thin, a script, a
knowledge record. An MCP server is CREATED only when the gap is proven unsolvable by a
deterministic approach (genuinely live/stateful). MCP is the last resort, never the reflex.

## The decision you own: transport follows statefulness

Get this right before anything else:

- **Batch / stateless capability** (boot, do, emit, exit — run a build and capture stderr,
  run a script and capture output, parse a file) → a **CLI tool** in the pack's `tools/`.
  Zero server, zero tool-schema cost, discovered via `--help` and the pack's tool registry.
  The default; reach for it unless you can name why it cannot work.
- **Live / stateful capability** against a _running_ process (hold state across calls,
  set-a-value-and-see-it-update) → **MCP**, the documented future escape hatch. Not built
  yet: if a gap truly needs it, say so in the verdict and stop — do not improvise a server.

If a stateless CLI can cover the need at all, it wins.

## Where to look

In this order — stop when you can write the definition:

1. **Do we already have it?** Glob the pack's `tools/` and `library/tools/`, read the pack's
   tool registry, and the project's `CLAUDE.md` index (+ `.claude/library/` conventions). An
   existing tool or skill covering the gap = say so and stop — a successful result. A prior
   verdict is revisited only if the gap explains what changed.
2. **Can we build it thin ourselves?** Most stateless capabilities are a few lines wrapping a
   project script or a Node/CLI command. Prefer this — owned, no dependency, in our grain.
3. **Is there an MIT tool to lift?** Only if building thin is genuinely more than a thin
   wrapper. License gate is hard: **MIT or it is not a candidate** (no license =
   all-rights-reserved = out). Rewrite the slice we need with attribution — never vendor
   wholesale. Shallow-clone lift candidates into `$HOME/.cache/xenomoon/cli-eval/<name>`.

## Workflow

1. **Confirm the gap and the transport.** Restate what the agent needed, what it tried, why
   what we had fell short. Decide CLI vs MCP (above).
2. **Scout** (order above). For a lift: read the actual tool, confirm license, confirm the
   slice lifts without dragging in a whole bridge.
3. **Write the tool-definition** — `library/tools/<slug>.md` (see Tool-definition record below). Write it even
   when the verdict is "build thin" — it is both the build spec and the registry entry the
   next session reuses.
4. **Ask the human** (`mcp__ui__form` foreground / `mcp__ui__ask` backgrounded): read-only
   `note` with the verdict (capability, transport + why, build-thin vs lift, interface), then
   a required `select` — adopt / reject / park, your recommendation first.
5. **Hand off, build nothing.** On adopt, the definition's build task (in `## Context`) becomes a
   one-line task the orchestrator dispatches to the active domain's builder; registering the
   tool in the pack's registry is part of that build task.
6. **Clean up** — `rm -rf "$HOME/.cache/xenomoon/cli-eval/<name>"` after the verdict, both
   outcomes.

## Tool-definition record

One record per capability, created with `library-record-create` (`$REC` is defined there):
`$REC new tools <slug> --description "<verdict>" --by agent:researcher` (format:
`plugin/docs/library-record-standard.md`; words: `library-record-writing`).

- Subject: a tool-definition record is the verdict on one capability (build thin, lift from an MIT source, or needs MCP and parked), the interface and the one-line build task. Add `--tags` for the capability and transport.
- A lift source goes in a frontmatter extra key `resource:`.
- Body shape and field rules: `plugin/docs/library-record-standard.md` and the `library-record-writing` skill.

## Mode-specific never-do

- Create or edit anything under `tools/` or any project file.
- Improvise an MCP server — a live/stateful gap is a recommendation, not a build.
- Recommend paid, freemium, or license-less tools to lift from.

## Mode-specific return

The gap + transport decision + where you looked, the verdict + human's decision, the
`library/tools/<slug>.md` path, on adopt the one-line build task (incl. registry
registration) + what to observe when it works, cache cleanup confirmed.
