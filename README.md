<p align="center">
  <img src="assets/xm-logo-brown.png" alt="XenoMoon" width="380" />
</p>

# Xenomoon

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Status: experimental](https://img.shields.io/badge/Status-experimental-orange.svg)
![Skills: 36](https://img.shields.io/badge/Skills-36-b08d57)
![Agents: 9](https://img.shields.io/badge/Agents-9-b08d57)
![Domains: coghatch · expoapp · webapp](https://img.shields.io/badge/Domains-coghatch_·_expoapp_·_webapp-b08d57)

> **Early, but real.** A domain-focused fork of [Xenodot Forge](https://github.com/arthur0n/xenodot-forge). Names and APIs still move; everything described below runs today.

## What this is

Xenomoon gives **one developer a full AI team**. An orchestrator and specialized subagents drive a deliberate, human-gated pipeline — **triage → solution → implement → verify → you** — through a web UI, so you don't live in the terminal.

It is built on the Claude Code SDK and it is **domain-neutral**: you install it beside a project, pick a domain pack, and it runs that pipeline for whatever you're building — and it **learns that project** as it goes.

Godot stays the exclusive product of the upstream we forked from — it is **not** a domain here. We pull only curated, domain-agnostic improvements, so the engine payload never lands.

## How it's put together

- **This repo is the trunk.** It is never bound to a project directly.
- **One install per domain** (named `<domain>-xm`, e.g. `webapp-xm`). An install is a full framework checkout that holds **many projects**: the `projects` map in its gitignored `.xenomoon.json` lists each one (name → folder, port).
- **Domains are install-time pickers only.** Installing copies the chosen pack's agents and skills into `plugin/` and bakes the descriptor into `.xenomoon.json`. Nothing under `domains/` is read at runtime.
- **At runtime there is exactly ONE capability tree: `plugin/`.** Every session loads it.
- **Your project stays pure.** The framework reads it in place; project-side state is confined to `<project>/.xenomoon/` plus project-owned capabilities in `<project>/.claude/`.

```
xenomoon/                      ← the INSTALL (fork/clone; your projects of that domain are added to it)
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

Step 0 is a workspace folder, and your project beside it or inside it. Everything else is one
command, run inside the workspace:

```bash
mkdir -p workspace && cd workspace          # the folder where the install will live
npx github:arthur0n/xenomoon ../myapp --domain=webapp    # ../myapp must already exist
```

If an install of that domain is already registered on this machine, the project is added to it
(no clone). If none is, it creates ONE install named `<domain>-xm` in the folder you ran the
command from (`workspace/webapp-xm`); two registered installs of the same domain make it stop and
list them. Then it asks: port → Hermes/Codex/Kimi. If your project already uses Claude, it offers
the onboarding interview. It also links the `xenomoon` CLI.

Add a second project of the same domain from inside the install, with the same command the first
one used:

```bash
cd webapp-xm
npm run install-project -- ../shop [--name=shop] [--port=3118]
```

The first run installs the domain; every later run only adds and prepares the project (ignore
lines, a `CLAUDE.md` when it has none, library stubs, branch model, its own port, its own
`.xenomoon/settings.json`). A project of another domain needs that domain's install, so a different
`--domain` is refused.

Start, stop and watch every project from the hub, run in the install:

```bash
npm run hub              # http://127.0.0.1:3110 (XENOMOON_HUB_PORT); opens the hub page
```

`npm run hub` builds the page when it is missing or its inputs changed. A failed build stops the hub with the error.
The hub keeps one connection to the status stream of every running project. Its routes:

- `GET /api/hub/status` — the rows (every project with its state).
- `GET /api/hub/stream` — the same rows as server-sent events: one at connect, one on each change.
- `GET /api/hub/ping` — answers `{ "hub": true, "pid": … }`; a starting hub uses it to see that a hub already runs on the port.
- `GET /` and the page's files — the built page from `ui/hub/dist/`.
- `POST /api/hub/rows/<id>/start` and `/stop` — start or stop one project.

Every GET route (the page too) and the start and stop routes need the hub's own Host, and an Origin that is absent or the hub's own; otherwise 403.
A method other than GET or POST is answered 405.
A row carries `watch: "no-stream"` when the project's status stream route answers 404, which is the case for an install that is not updated yet.

The `xenomoon` CLI:

```bash
xenomoon doctor          # health check of one project
xenomoon update          # pull the latest framework
xenomoon promote         # apply approved promotions
xenomoon list            # every project of every install on this machine, with its folder and port
```

**`doctor` acts on ONE project:** the one whose folder you are in, or the one you name with
`--project=<name>`. When the command cannot tell, it stops and lists the project names instead of
guessing — silently driving the wrong project is the one outcome worth failing over. Projects are
started and stopped from the hub, not one by one.

Already have the framework checked out? Same flow, minus step zero:

```bash
npm ci
npm run install-project -- <PATH> --domain=webapp   # add a project (the first run installs the domain)
npm run hub                                         # start, stop and watch the projects
```

Optional: with the `rtk` (Rust Token Killer) token-saving proxy on PATH, the framework detects
it per session and routes agent shell commands through it automatically. Everything works
identically without it; `doctor` reports it as a soft check.

## What works today

- **A domain-neutral spine.** Everything domain-specific — project marker, orchestrator prompt, capabilities, build and verify commands — is read from the pack descriptor baked at install time. No hardcoded product.
- **Deterministic per-project install**, including into existing projects, never scaffolding over your code. The binding is a committed lock, read literally; a conflicting override is **refused**, not silently applied.
- **Two shipped packs.** **`webapp`**: React + Node, running an issue-driven `triage → solution → implement` pipeline with QA and auto-commit stages. **`expoapp`**: React Native / Expo, both platforms, with simulator and emulator acceptance lanes plus local-run and ship skills.
- **A CLI that refuses to guess.** Every verb resolves the project from your location (or `--project=<name>`), says which one it picked, and stops when that is ambiguous.
- **Safety gates that don't depend on an agent remembering.** Anything with consequences — pushing to the deploy branch, merging, changing dependencies, creating branches, spending money on a metered API, pushing with migrations unapplied, firing a Codex review unattended — is **policy** in the project's `.xenomoon/settings.json`, and it defaults to asking you; `allow` (the literal string) is the per-project opt-in an **autonomous** run needs, since an unattended prompt is refused. Push is also a LANE: only the push stage (`senior-analyst` + `push-method`, never the author) publishes, and your **branch model** draws the line — a routine work-branch push runs free, the deploy-reaching one is the gate. Two layers read those same rules, so the answer is the same either way: the web UI's permission gate, and a hook covering terminal sessions and subagents, which never load that gate. Separately, the orchestrator cannot edit your working tree at all — it dispatches agents. The tree belongs to you and the pipeline.
- **External workers, used not competed with.** Optional **Hermes** (researcher/critic) and **Codex** (reviewer) integrations with per-domain profiles and cost-basis economics — subscription workers are there to be spent.
- **Self-improvement loops, all human-gated.** Sessions end in a debrief; learnings become project-local capabilities; a promotions flow moves the good ones upward — you approve every step. The forge audits itself the same way, recording findings in a ledger you apply.

## What's not here yet

More domain packs beyond `webapp` / `expoapp`, OpenClaw/Hermes adapters, a package marketplace, and per-project knowledge isolation. We're targeting the open [agentskills.io](https://agentskills.io) `SKILL.md` / `SOUL.md` standard so a package authored once can run on Claude Code today and other runtimes later. The direction and the open seams are written down in [docs/fork/VISION.md](docs/fork/VISION.md) and [docs/fork/SEAMS.md](docs/fork/SEAMS.md).

## Tracking upstream

We follow [arthur0n/xenodot-forge](https://github.com/arthur0n/xenodot-forge) closely, but the flow is **one-way**: we **fetch** its improvements and **never push back** to any `xenodot-forge` repo (a `pre-push` hook hard-blocks that). Our xenomoon trunk is `main`, published **only** to the `xenomoon` remote (`arthur0n/xenomoon`); on each pull we take upstream's curated, domain-agnostic changes (never the engine payload) and re-apply the committed xenomoon rebrand (`scripts/rebrand.mjs`). The workflow is in [docs/fork/SYNC.md](docs/fork/SYNC.md).

## License

[MIT](LICENSE), inherited from upstream.
