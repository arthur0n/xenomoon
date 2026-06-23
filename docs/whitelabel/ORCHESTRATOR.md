# The orchestrator ↔ CLAUDE.md contract

Xenomoon splits a project's AI guidance into two layers with a strict rule:

> **Policy & routing → the domain `orchestrator.md` (framework-owned, inherited).
> Project facts → the project's `CLAUDE.md`.**

## Why

The framework loads, into every project session, the active domain pack's `orchestrator.md`
(`ui/server/core/config.js` → `ORCHESTRATOR_PROMPT` ← `DOMAIN.orchestrator`) as the orchestrator's
system-prompt append, **plus** the project's own `CLAUDE.md` (via the session's `settingSources`).
Keeping generic agent policy in the inherited orchestrator means every project of a domain gets the
same battle-tested routing and guardrails for free, while the project's `CLAUDE.md` stays a short,
readable description of THIS project — not a re-statement of the framework's rules.

## What lives where

**`domains/<name>/orchestrator.md`** — framework-owned, inherited, do NOT fork per project:

- Routing rules (request shape → which agent / command).
- The human-gated loop (understand → slice → implement → verify → stop).
- Ask-via-tools policy (`AskUserQuestion` / `mcp__ui__form` / `mcp__ui__ask`; one decision, one channel).
- Task board, background work, and handoff rules.
- Promotion rules + the **self-improvement protocol** (below).
- Generic NEVER-rules (no secrets in code; deploy is CI-only; branch-create needs approval).
- The markdown-subset note (the UI renders only a limited subset).

**`<project>/CLAUDE.md`** — project FACTS only (see the template at
`domains/webapp/templates/CLAUDE.md`):

- Stack, data model / tenancy, commands, infrastructure / deploy targets.
- The project's **convention floor** (its own hard rules) + a project-specific NEVER list.
- No routing, no agent policy — those are inherited from the orchestrator.

## Self-improvement — how the orchestrator "knows how to improve"

A freshly bound project gets the head-start `orchestrator.md` + a facts-only `CLAUDE.md` (from the
template). As the orchestrator works, it **learns the project**: when it finds a durable convention,
footgun, or reusable skill, it records it — **project-local first** (`.claude/skills/<name>/`, a line
in the project's `CLAUDE.md` convention floor, or a project-level `orchestrator.md` override),
human-gated (writes under `.claude/` are foreground-approved). When a project-local capability proves
broadly useful — not specific to this project — `mcp__ui__promote` files it on the promotions board;
on approval `npm run promote` moves it into the **active domain pack**
(`FRAMEWORK_PLUGIN_DIR` = `domains/<active>/plugin`), so the NEXT project of that domain starts ahead.
Nothing is "learned" silently; promotion is deliberate.

## Migrating an existing project (e.g. a fat CLAUDE.md)

Split it: generic policy / routing / NEVER-rules move OUT (they already live in the inherited
orchestrator — delete the duplicates); project facts stay. The result reads like the template —
overview, stack, data model, commands, infra, convention floor, NEVER.
