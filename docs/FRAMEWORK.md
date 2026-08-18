# Xenomoon — orientation for AI agents

Audience: an AI agent starting a session on this repo (or a clone of it). Read this ONCE
per session instead of re-researching the codebase. It is deliberately "timeless": it
records identity, goals, layout directions, and invariants — not per-file detail. If a
specific path here is missing, the direction still holds; verify with a quick `ls`, don't
re-derive the whole map.

## What this is

Xenomoon is a framework built on the Claude Code SDK. Its goal: give **one human
developer a full AI team** working on a software project — orchestrator + specialized
subagents (Opus/Sonnet) driving a deliberate, human-gated pipeline
(**triage → solution → implement → verify → human**) through a web UI, **without the
human living in the terminal**.

It is a domain-focused fork of `arthur0n/xenodot-forge` ("xenodot"). Godot is the
upstream's product, NOT ours: we fetch only curated, domain-agnostic improvements
(one-way; we never push to any `xenodot-forge` repo — a pre-push hook blocks it).
Our brand is **XenomoonForge**: bronze/lunar identity, ringed-planet emblem, Moon-Gold
palette. Never reintroduce upstream's green alien identity.

## Core model — trunk, clones, domains, one plugin tree

- **This repo is the trunk.** It is never bound to a project directly.
- **One clone per project** (`xm-<name>` convention, e.g. `probius/lexflow-xm`). A clone
  is a full framework checkout **bound** to an external project via a gitignored
  `.xenomoon.json` (`projectDir`, baked `domainDescriptor`, worker config).
- **Domains are install-time pickers only** (`domains/webapp|expoapp`). `forge new
--domain X` COPIES the pack's agents/skills/commands into `plugin/` and bakes the
  descriptor into `.xenomoon.json`. **Nothing under `domains/` is read at runtime.**
- **At runtime there is exactly ONE capability tree: `plugin/`.** Every session loads it
  (namespaced `xenomoon:<name>`).
- **CORE owns the PIPELINE; a pack ships SKILLS.** The pipeline is what the framework IS
  (see the goal above), so it cannot be an optional pack feature: trunk `plugin/` ships the
  pipeline roster and its stage commands (`junior-analyst` → `/triage`, `senior-analyst` →
  `/solution`, and the stages still being promoted), the cross-cutting agents
  (product-owner, researcher, debrief, handoff-summarizer), the shared method skills
  (`code-investigation`, `library-first`, `intent-guardrails`, the `*-method` skills), the
  meta skills (`quick`, `caveman-forge`, `tasks-mcp`, `agent-report`,
  `autonomous-main-goal`) and the safety hooks. **A domain pack adds only what is genuinely
  domain-specific — skills** (expoapp: simulator/emulator lanes; webapp: browser lanes) —
  plus its `orchestrator.md` routing and any domain-only command. One role, one definition,
  every domain. Promoting a stage into CORE is a defined process:
  `plugin/docs/process/promote-agent-to-core.md`.
  _(History: the pack used to ship its own analyst/developer/reviewer/tester, which put the
  framework's own purpose behind a pack choice and drifted into one role per tree. That is
  what the promotion process is unwinding, one stage at a time.)_
- **The bound project stays pure.** The framework reads it in place. Project-side state
  is confined to `<project>/.xenomoon/` (task board `tasks.json`, `promotions.json`,
  `autonomous.json`, handoffs) and project-owned capabilities in `<project>/.claude/`
  that the learning loop authors for that project.

## Stable layout — directions, not inventory

- `plugin/` — the one runtime capability tree (see above). `plugin/docs/` +
  `plugin/commands/` SHIP with the plugin and may be referenced by capabilities/runtime.
- `domains/<name>/` — install-source catalog. Off the upstream-sync surface.
- `ui/server/` — Node server + CLI, by area: `core/` (+`core/http/`; `session.js` loads
  the one plugin, `config.js` reads the BAKED descriptor from `.xenomoon.json`),
  `integrations/{hermes,codex}/` (external LLM workers), `features/{tasks,promotions,
transcripts,skills,autonomous,pulse}/`, `mcp-tools/` (in-process `makeXTool` SDK tools),
  `cli/` (`setup`, `new`, `doctor`, `materialize`, `install-capabilities`, release
  scripts). `domain-resolver.js` is install-only.
- `ui/client/` — browser modules: `core/` (state, transport, render, `main.js`) and
  `features/{chat,activity,tasks,approvals,agents,settings,sessions,promotions,project,
autonomous,pulse}/`. `ui/lib/` — shared JSDoc typedefs.
- `docs/` and `.claude/` — **forge-local only** (never referenced from `plugin/` or
  `ui/server`). `docs/fork/` holds VISION, SEAMS, SYNC, ORCHESTRATOR, DOWNSTREAM;
  `docs/ROSTER.md` the agent roster doctrine.
- These top-level directions are stable; don't expect them to move.

## Session model (how work flows in a bound clone)

- The **orchestrator runs the pipeline itself** — stages are its own actions; it
  dispatches agents and never tells the human to run a command; it never implements.
  Discovery belongs to the owning agent (no pre-dispatch scouting). Answer length
  matches the question.
- **Project facts live project-side**: `<project>/.claude/library/` indexed by the
  project's `CLAUDE.md` (index-only doctrine — CLAUDE.md points, never dumps). Read the
  index, follow pointers; project rules override framework defaults.
- Routing doctrine (webapp pack): vague brief → `/design` first; bug → issue-tracker
  search first (issuekit; never re-try `DO-NOT-RETRY` attempts); research → Hermes
  worker first when enabled; every defect enters the pipeline.
- Persistent task board via `mcp__ui__tasks` → `<project>/.xenomoon/tasks.json`.
- **Pulse** (`ui/server/features/pulse/`) — the ambient landing sweep, and the answer to a
  structural gap: the session loop is _request-shaped_, so work that finished but never LANDED
  (unpushed branches, idle PRs, issues waiting on a human) stays invisible until the human finds
  it. One timer per server process runs deterministic read-only checks and injects a
  `[pulse · beat N]` turn **only for state that CHANGED** — unchanged findings are suppressed, so
  it informs without nagging. Off by default, armed from the header LED, sleeps after ~1h of flat
  beats and re-arms on the next human message.
  **It is not Autonomous Mode, and the distinction is the point:** Autonomous is goal-driven,
  self-dispatching, and escalates permissions (`session.autonomousActive` auto-allows every tool).
  Pulse has no goal, writes no code, dispatches nothing, never touches that flag, and stands down
  while Autonomous runs. New checks are human-approved — the Hive can propose one
  (`mcp__ui__pulse op:"propose_check"`), never add one at runtime, which is what stops it drifting
  into a second Autonomous.
- External workers when configured in `.xenomoon.json`: **Hermes** (researcher/critic
  roles) and **Codex** (reviewer); they are used as workers, not competed with.

## Self-improvement loops

The framework is designed to learn — per project and about itself.

Shipped (in `plugin/`, run in bound clones):

- **learn / debrief / contribute commands + researcher agent** — turn session outcomes
  into project-local capabilities (`p-*` agents, skills, library records) and queue
  material for promotion.
- **promotions** (`ui/server/features/promotions/`, `<project>/.xenomoon/promotions.json`)
  — human-gated flow that promotes project-learned capabilities upward.
- **handoff-summarizer** — compacts a session for the next agent.

Forge-local (in `.claude/commands/`, run on the trunk by the human, never shipped):

- **/framework-audit → /framework-audit-fix** — score agents/skills/orchestrator across
  quality dimensions into a ledger; apply agreed fixes by finding-id.
- **/framework-feedback** — distil THIS conversation into ledger findings.
- **/harvest-sessions** — mine `logs/session-*.ndjson` + recorded human NOs for
  recurring friction; append findings to the ledger.
- **/token-audit → /token-audit-fix** — find agent/LLM turns that could be
  deterministic; apply and record the token delta.
- **/sync-upstream** — human-gated one-way pull from xenodot (identity stays OURS,
  engine payload dropped, rebrand codemod re-run).
  All loops are **human-gated**: they record findings; the human applies.

## Invariants (do not violate)

1. Plain JS + JSDoc only — no `.ts`. `npm run validate` (tsc checkJs + eslint
   zero-warnings + structure + skill-scope) must pass before commit.
2. Prefix shell commands with `rtk` (hook-enforced).
3. Never push to any `xenodot-forge` remote; publish only `git push xenomoon main`.
4. Bronze identity everywhere; never upstream's green.
5. No project-specific files in the framework; no framework files scattered in the
   project beyond `.xenomoon/` + project-owned `.claude/`.
6. Roster discipline: an agent is specialized, or generic + skills — not both.
7. `docs/` + `.claude/` never referenced from shipped code; `plugin/docs/` is the
   shippable doc home.
8. New server/client files go in the matching existing area; don't invent top-level dirs.

## Orient fast (instead of re-researching)

1. Read this file. 2. `git log --oneline -15` for recent direction. 3. If the question
   is architectural: `graphify query "<question>"` when `graphify-out/` exists, else
   `docs/fork/VISION.md` + `docs/fork/SEAMS.md`. 4. For roster/capability questions:
   `docs/ROSTER.md`, `plugin/docs/process/`. 5. In a bound clone: the project's `CLAUDE.md`
   index + `<project>/.claude/library/`. Only after these, fall back to reading source.

Live reference install (example, may age): `probius/lexflow-xm` — webapp-domain clone
bound to `probius/lexflow` (React+Vite / Lambda+tRPC+Drizzle study platform).
