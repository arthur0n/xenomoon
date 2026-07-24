# Xenomoon Forge — framework spine rules

Rules for working **on the framework itself** (the Node/JS web UI and tooling under
`ui/`). The bound project's own rules live in the project, not here — they come from the
active domain pack's `orchestrator.md` + the project's own `CLAUDE.md`, which the
framework loads into every project session.

> Scaffold — expand with your own conventions. The essentials below match what the repo
> already enforces.

## Always

- Prefix shell commands with `rtk` (a PreToolUse hook enforces it; see `.claude/settings.json`).
- Plain JS + JSDoc only — no `.ts` files. Types are checked via tsconfig `checkJs`.
- Node/CLI scripts live in `ui/server/` so eslint's node group + tsconfig type-check them.
- **Identity — never revert to upstream's look.** Keep the bronze "lunar" identity: the ringed-planet
  emblem (mark/logo/favicon), the Lunar-Bronze / Moon-Gold palette in `ui/agent-ui.css` (the `--green`
  token is Moon Gold, NOT green), and the brand word "XenomoonForge". NEVER reintroduce upstream's
  green alien-head emblem or alien-green palette. When a sync touches `ui/index.html`,
  `ui/agent-ui.css`, or emblem/favicon assets, take upstream's behavior/structure only and resolve
  every color/identity/branding hunk as OURS. Sync runbook: `docs/fork/SEAMS.md`.
- **Sync is ONE-WAY — fetch from upstream, publish only to OUR repo.** This is a domain-focused fork of
  the godot source `arthur0n/xenodot-forge` (the `upstream` and `origin` remotes). We **only ever
  fetch** curated, domain-agnostic updates from it (via `/sync-upstream`) and **NEVER push to any
  `xenodot-forge` repo** — the committed `.husky/pre-push` hook hard-blocks it; never route around it.
  Our **sole publish target is the `xenomoon` remote** (`arthur0n/xenomoon`): publish with
  `git push xenomoon main`, which goes out as **arthur0n** (the repo owner; the repo-local
  `.git/config` credential pin). See `docs/fork/SYNC.md`.

## Before committing

- `npm run validate` (tsc + eslint zero-warnings + structure + skill-scope) must pass.
- `npx prettier --write` keeps formatting clean (lint-staged also runs it on commit).

## Layout

- `plugin/` — the framework's **ONE capability tree** (the only one loaded at runtime): agents,
  skills, commands, hooks, `orchestrator.md`, plus the meta skills (`caveman`, `quick`, `agent-report`,
  `tasks-mcp`, `autonomous-main-goal`), safety hooks, `handoff-summarizer`, and the researcher learning
  loop. `forge new --domain X` installs the picked pack's capabilities INTO this tree; after install
  there is no "domain" at runtime — it is just the framework, one tree. Capabilities namespace as
  `xenomoon:<name>`.
- `domains/<name>/` — the **install-source catalog** (`app`, `webapp`, `expo`). A **domain is an install-time
  PICKER only**: each pack ships agents/commands/skills, a `domain.json` descriptor, and an
  `orchestrator.md`, and `forge new --domain X` (`ui/server/cli/install-capabilities.js`) COPIES those
  into `plugin/` and bakes the descriptor into `.xenomoon.json`. **Nothing under `domains/` is loaded,
  resolved, or read at runtime** — the session loads exactly one plugin (`session.js`). `webapp` is a
  populated head-start (issue-driven triage → solution → implement pipeline); `expo` is a populated
  React Native/Expo pack; `app` is an empty learning pack. `domains/` stays off the upstream-sync
  surface (see `docs/fork/SEAMS.md`).
- **Doc/command placement:** `plugin/docs/` + `plugin/commands/` SHIP with the plugin and may be
  referenced by capabilities/runtime code; `docs/` and `.claude/` are forge-local only — never
  reference them from `plugin/` or `ui/server`.
- `ui/server/` — Node server + CLI scripts, grouped by area: `core/` (+ `core/http/`),
  `integrations/{hermes,codex}/`, `features/{tasks,promotions,transcripts,skills,autonomous}/`,
  `mcp-tools/` (the in-process `makeXTool` SDK tools), and `cli/` (`setup`, `new`, `doctor`,
  `materialize`, `update-badges`, `release-*`; `promote` lives in `features/promotions/`). New files
  go in the matching area.
- `ui/client/` — browser modules, grouped by area: `core/` (state, transport, dom/render helpers,
  `main.js` entry) and `features/{chat,activity,tasks,approvals,agents,settings,sessions,promotions,
project,autonomous}/`. `ui/lib/` — shared JSDoc typedefs + helpers.
- `ui/server/core/domain-resolver.js` is **install-only**: `loadDomain`/`availableDomains`/
  `resolveProjectTemplate` feed the picker (`forge new`). At runtime the spine reads the BAKED
  descriptor from `.xenomoon.json` (`config.js` `DOMAIN`), never a live `domains/` pack. Godot is NOT a
  domain here; it stays the exclusive upstream product, and we pull only curated, domain-agnostic
  updates so the engine payload never lands.
- Never put project-specific files in the framework; it points at an external project, reads it in
  place, and the project stays pure.
