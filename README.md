<p align="center">
  <img src="assets/xm-logo-brown.png" alt="XenoMoon" width="380" />
</p>

# Xenomoon

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Status: experimental](https://img.shields.io/badge/Status-experimental-orange.svg)
![Skills: 29](https://img.shields.io/badge/Skills-29-b08d57)
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
- **Domains are install-time pickers only.** Installing copies the chosen pack's agents/skills/commands into `plugin/` and bakes the descriptor into `.xenomoon.json`. Nothing under `domains/` is read at runtime.
- **At runtime there is exactly ONE capability tree: `plugin/`.** Every session loads it.
- **Your project stays pure.** The framework reads it in place; project-side state is confined to `<project>/.xenomoon/` plus project-owned capabilities in `<project>/.claude/`.

```
xenomoon/                      ← the INSTALL (fork/clone; your projects bind to it)
├── plugin/                    ← the framework's ONE plugin tree: loaded into EVERY session
│   ├── skills/  hooks/  agents/  commands/     (meta skills, safety gates, researchers)
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
`../myapp-xm` — one install per project, learnings stay per project), then walks the terminal
questionnaire: domain → port → Hermes/Codex/Kimi. If your project already uses Claude, it
offers the onboarding interview (terminal Claude Code) BEFORE the server starts. It also links
the `xenomoon` CLI, so from then on the verbs are real words:

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

(`up`/`stop`/`restart` are thin wrappers over `./start_server` / `./stop_server` — PID file
under `.xm-run/`, port reclaim, survives the launching terminal.)

**More than one project?** npm gives every install the same global `xenomoon` bin, so the name
belongs to whichever install ran `xenomoon install` last. That ownership decides nothing: a verb
acts on the install your **location** resolves to, and every run prints which install it picked.

```
xenomoon update → /ws/alpha-xm  (cwd is inside this install)
```

Resolution order: `--install=<path>` (or `XENOMOON_INSTALL`) → the install you are inside → the
install bound to the project you are inside → the only install on the machine. If none of those
settle it, the verb **stops and lists the candidates** rather than guessing — silently driving the
wrong project is the one outcome worth failing over. Installs register themselves at install time
in `~/.xenomoon/installs.json` (`XENOMOON_REGISTRY` overrides the path); the file is a cache, so a
deleted install is pruned on the next read and `xenomoon doctor` re-registers the one it runs in.

Already have the framework checked out? Same flow, minus step zero:

```bash
npm ci
npm run install-project  # the questionnaire (or pass flags: -- <PATH> --domain=webapp)
npm start                # http://localhost:3117 (or your chosen port)
```

(Have the optional `rtk` (Rust Token Killer) token-saving proxy on PATH? The framework
detects it per session and auto-routes agent shell commands through it (the `rtk-rewrite`
hook) — nothing to configure. For your own terminal commands, prefix manually (`rtk npm ci`).
Everything works identically without it; `doctor` reports it as a soft, optional check.)

Or hand the whole install to an agent — paste this verbatim, replacing the target path:

```text
You are installing the Xenomoon Forge framework into a React + Node.js web app, using the `webapp` domain.

Context:
- Framework repo = the xenomoon checkout you are running in (this directory).
- Target project = <ABSOLUTE_PATH_TO_YOUR_WEBAPP>  ← a React + Node.js app with a package.json.
- Domain = `webapp`: a Node domain that installs in place, writes nothing into your project, and keeps it pure.

If `rtk` is on PATH (`command -v rtk`), prefix every shell command with it; otherwise run the
commands plain — they are identical either way. Do exactly this:
1. Install framework deps:        npm ci
2. Install into the project:       npm run install-project -- <ABSOLUTE_PATH_TO_YOUR_WEBAPP> --domain=webapp
   (locks the domain, binds the path in .xenomoon.json, runs doctor)
3. Confirm health:                 npm run doctor   → must report OK for the webapp domain.
4. Boot the UI:                    npm start         → serves http://localhost:3117
5. Verify: open http://localhost:3117 (expect HTTP 200) and check /api/state returns the project's
   name with "found": true.

Do not scaffold, copy, or edit anything inside the target project beyond the framework binding.
Stop and report if `doctor` fails or the `webapp` domain is not found.
```

## What works today

- **A domain-neutral spine.** The framework reads everything domain-specific (project marker, orchestrator prompt, capabilities, build/verify commands) from the pack descriptor baked at install time. No hardcoded product.
- **Deterministic per-project install** — including into existing, non-greenfield projects, never scaffolding over your code. The binding is a committed lock, read literally; a conflicting override is **refused**, not silently applied.
- **Two shipped packs.** **`webapp`**: a React + Node head-start running an issue-driven `triage → solution → implement` pipeline (analyst / developer / reviewer / tester agents, QA and auto-commit stages). **`expoapp`**: a React Native / Expo pack (both platforms) with a `uat-runner` agent, the `/uat` command, and Android/iOS local-run + ship skills.
- **A CLI that refuses to guess.** Every verb resolves the install from your location, prints which one it picked, and stops with a candidate list when ambiguous — it never silently drives the wrong project.
- **Mechanical safety gates.** The orchestrator's role is enforced at the tool boundary, not by prose: mutating git is denied to the main loop (the working tree belongs to you and the pipeline), merge/promote surfaces as a human approval, and the orchestrator dispatches agents instead of implementing. Two layers, because a prohibition you have to _recall_ loses to an affordance that is _present_: the web UI enforces it in the session's permission gate, and a hook enforces the same class in terminal sessions, which never load that gate. Sub-agents and read-only git stay untouched — investigation is genuinely the orchestrator's job. A third hook layer guards destructive git/shell for **every** caller, sub-agents included.
- **External workers, used not competed with.** Optional **Hermes** (researcher/critic) and **Codex** (reviewer) integrations with per-domain profiles and cost-basis economics — subscription workers are there to be spent.
- **Self-improvement loops, all human-gated.** Sessions end in a debrief; learnings become project-local capabilities; a promotions flow moves the good ones upward — you approve every step. The forge itself is audited the same way (framework-audit, session harvesting, token audits), findings recorded in a ledger the human applies.

## What's not here yet

More domain packs beyond `webapp` / `expoapp`, OpenClaw/Hermes adapters, a package marketplace, and per-project knowledge isolation. We're targeting the open [agentskills.io](https://agentskills.io) `SKILL.md` / `SOUL.md` standard so a package authored once can run on Claude Code today and other runtimes later. The direction and the open seams are written down in [docs/fork/VISION.md](docs/fork/VISION.md) and [docs/fork/SEAMS.md](docs/fork/SEAMS.md).

## Tracking upstream

We follow [arthur0n/xenodot-forge](https://github.com/arthur0n/xenodot-forge) closely, but the flow is **one-way**: we **fetch** its improvements and **never push back** to any `xenodot-forge` repo (a `pre-push` hook hard-blocks that). Our xenomoon trunk is `main`, published **only** to the `xenomoon` remote (`arthur0n/xenomoon`); on each pull we take upstream's curated, domain-agnostic changes (never the engine payload) and re-apply the committed xenomoon rebrand (`scripts/rebrand.mjs`). The workflow is in [docs/fork/SYNC.md](docs/fork/SYNC.md).

## License

[MIT](LICENSE), inherited from upstream.
