<p align="center">
  <img src="assets/xm-logo-brown.png" alt="XenoMoon" width="380" />
</p>

# Xenomoon

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Status: experimental](https://img.shields.io/badge/Status-experimental-orange.svg)
![Skills: 32](https://img.shields.io/badge/Skills-32-b08d57)
![Agents: 9](https://img.shields.io/badge/Agents-9-b08d57)
![Domains: expoapp · webapp](https://img.shields.io/badge/Domains-expoapp_·_webapp-b08d57)

> **Early, but real.** A domain-focused fork of [Xenodot Forge](https://github.com/arthur0n/xenodot-forge). Names and APIs still move; everything described below runs today.

## What this is

Xenomoon gives **one developer a full AI team**. An orchestrator and specialized subagents drive a deliberate, human-gated pipeline — **triage → solution → implement → verify → you** — through a web UI, so you don't live in the terminal.

It is built on the Claude Code SDK and it is **domain-neutral**: you install it beside a project, pick a domain pack, and it runs that pipeline for whatever you're building — and it **learns that project** as it goes.

Godot stays the exclusive product of the upstream we forked from — it is **not** a domain here. We pull only curated, domain-agnostic improvements, so the engine payload never lands.

## How it's put together

- **This repo is the trunk.** It is never bound to a project directly.
- **One install per project** (`xm-<name>` convention). An install is a full framework checkout **bound** to an external project via a gitignored `.xenomoon.json`.
- **Domains are install-time pickers only.** Installing copies the chosen pack's agents and skills into `plugin/` and bakes the descriptor into `.xenomoon.json`. Nothing under `domains/` is read at runtime.
- **At runtime there is exactly ONE capability tree: `plugin/`.** Every session loads it.
- **Your project stays pure.** The framework reads it in place; project-side state is confined to `<project>/.xenomoon/` plus project-owned capabilities in `<project>/.claude/`.

```
xenomoon/                      ← the INSTALL (fork/clone; your projects bind to it)
├── plugin/                    ← the framework's ONE plugin tree: loaded into EVERY session
│   ├── skills/  agents/  hooks/                 (capabilities, safety gates)
│   └── docs/process/          (updates-routing.md · repo-boundary.md · promotion.md)
├── domains/<name>/            ← install-time PICKER packs (webapp, expoapp) — never loaded at runtime
│   ├── domain.json  orchestrator.md
│   └── plugin/                ← the pack's capabilities, COPIED into plugin/ on install
├── ui/                        ← the server + web app that runs sessions
└── docs/  scripts/            ← repo meta
```

Your project stays a separate repo and hosts none of this — see `plugin/docs/process/repo-boundary.md`. How learnings route between framework, domain, and project: `plugin/docs/process/updates-routing.md`.

## Quick start — from a machine with NOTHING

Step 0 is your project folder. Everything else is one command, run inside it:

```bash
cd myapp                          # your project (existing, or freshly created)
npx github:arthur0n/xenomoon
```

It confirms the folder as the project, installs the framework BESIDE it (default sibling
`../myapp-xm`), then asks: domain → port → Hermes/Codex/Kimi. If your project already uses
Claude, it offers the onboarding interview before the server starts. It also links the
`xenomoon` CLI:

```bash
xenomoon up              # serve the UI DETACHED (recommended — terminal stays free)
xenomoon restart         # stop + start detached (after an update or config change)
xenomoon stop            # stop the detached server
xenomoon start           # same server, foreground (logs in the terminal)
xenomoon doctor          # health check
xenomoon update          # pull the latest framework
xenomoon promote         # apply approved promotions
xenomoon list            # every install on this machine, and what each one drives
```

**With several projects, verbs follow your location, not a global setting.** Run one from
inside an install (or inside the project it drives) and it acts on that one, printing which it
picked. When nothing settles it, the verb stops and lists the candidates instead of guessing —
silently driving the wrong project is the one outcome worth failing over.

Already have the framework checked out? Same flow, minus step zero:

```bash
npm ci
npm run install-project  # the questionnaire (or pass flags: -- <PATH> --domain=webapp)
npm start                # http://localhost:3117 (or your chosen port)
```

Optional: with the `rtk` (Rust Token Killer) token-saving proxy on PATH, the framework detects
it per session and routes agent shell commands through it automatically. Everything works
identically without it; `doctor` reports it as a soft check.

## What works today

- **A domain-neutral spine.** Everything domain-specific — project marker, orchestrator prompt, capabilities, build and verify commands — is read from the pack descriptor baked at install time. No hardcoded product.
- **Deterministic per-project install**, including into existing projects, never scaffolding over your code. The binding is a committed lock, read literally; a conflicting override is **refused**, not silently applied.
- **Two shipped packs.** **`webapp`**: React + Node, running an issue-driven `triage → solution → implement` pipeline with QA and auto-commit stages. **`expoapp`**: React Native / Expo, both platforms, with simulator and emulator acceptance lanes plus local-run and ship skills.
- **A CLI that refuses to guess.** Every verb resolves the install from your location, says which one it picked, and stops when that is ambiguous.
- **Safety gates that don't depend on an agent remembering.** Anything with consequences — pushing, changing dependencies, creating branches, spending money on a metered API, pushing with migrations unapplied — is **policy** in `.xenomoon.json`, and it defaults to asking you. Two layers read those same rules, so the answer is the same either way: the web UI's permission gate, and a hook covering terminal sessions and subagents, which never load that gate. Separately, the orchestrator cannot edit your working tree at all — it dispatches agents. The tree belongs to you and the pipeline.
- **External workers, used not competed with.** Optional **Hermes** (researcher/critic) and **Codex** (reviewer) integrations with per-domain profiles and cost-basis economics — subscription workers are there to be spent.
- **Self-improvement loops, all human-gated.** Sessions end in a debrief; learnings become project-local capabilities; a promotions flow moves the good ones upward — you approve every step. The forge audits itself the same way, recording findings in a ledger you apply.

## What's not here yet

More domain packs beyond `webapp` / `expoapp`, OpenClaw/Hermes adapters, a package marketplace, and per-project knowledge isolation. We're targeting the open [agentskills.io](https://agentskills.io) `SKILL.md` / `SOUL.md` standard so a package authored once can run on Claude Code today and other runtimes later. The direction and the open seams are written down in [docs/fork/VISION.md](docs/fork/VISION.md) and [docs/fork/SEAMS.md](docs/fork/SEAMS.md).

## Tracking upstream

We follow [arthur0n/xenodot-forge](https://github.com/arthur0n/xenodot-forge) closely, but the flow is **one-way**: we **fetch** its improvements and **never push back** to any `xenodot-forge` repo (a `pre-push` hook hard-blocks that). Our xenomoon trunk is `main`, published **only** to the `xenomoon` remote (`arthur0n/xenomoon`); on each pull we take upstream's curated, domain-agnostic changes (never the engine payload) and re-apply the committed xenomoon rebrand (`scripts/rebrand.mjs`). The workflow is in [docs/fork/SYNC.md](docs/fork/SYNC.md).

## License

[MIT](LICENSE), inherited from upstream.
