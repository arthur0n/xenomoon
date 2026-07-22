<p align="center">
  <img src="assets/xm-logo-brown.png" alt="XenoMoon" width="380" />
</p>

# Xenomoon

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Status: experimental](https://img.shields.io/badge/Status-experimental-orange.svg)

> **Early experiment.** A white-label fork of [Xenodot Forge](https://github.com/arthur0n/xenodot-forge). Names, layouts, and APIs will change; nothing here is stable yet.

## What this is

Xenomoon is a Claude Code framework that drives a deliberate, human-gated pipeline — **triage → solution → implement → verify → you** — instead of a chat box. It's **domain-neutral**: you install it per project, lock it to a domain, and it runs that pipeline for whatever you're building.

Godot stays the exclusive upstream product we forked from — it is **not** a domain here. We pull only its (curated) domain-agnostic improvements, so the engine payload never lands.

## Layout — one map

```
xenomoon/                      ← the INSTALL (fork/clone; your projects bind to it)
├── plugin/                    ← CORE Claude-Code plugin: loaded into EVERY session
│   ├── skills/  hooks/  agents/  commands/     (meta skills, safety gates, researchers)
│   └── docs/process/          (updates-routing.md · repo-boundary.md · promotion.md)
├── domains/<name>/            ← one pack per domain (webapp, expo, app)
│   ├── domain.json  orchestrator.md
│   └── plugin/                ← the DOMAIN's Claude-Code plugin (loads alongside CORE)
│       ├── agents/  commands/  hooks/
│       ├── skills/            ← capabilities the domain LEARNED (via promotions)
│       └── library/           ← learned records: findings/ verdicts/ tools/
├── ui/                        ← the server + web app that runs sessions
└── docs/  scripts/            ← repo meta
```

Naming note: `plugin/` (CORE, domain-agnostic) and `domains/<name>/plugin/` (that domain's
pack) are BOTH Claude-Code plugins — the CORE one loads always, the domain one per bind.
Your project stays a separate repo and hosts none of this — see
`plugin/docs/process/repo-boundary.md`. How learnings route between framework, domain, and
project: `plugin/docs/process/updates-routing.md`.

## Quick start — install into a project

Install the framework into a React + Node.js web app. The `webapp` domain installs **in place** and
writes nothing into your project (it binds the path in the framework's gitignored `.xenomoon.json`):

```bash
rtk npm ci
rtk npm run new -- <ABSOLUTE_PATH_TO_YOUR_WEBAPP> --domain=webapp
rtk npm run doctor
rtk npm start            # http://localhost:3117
```

Or hand the whole install to an agent — paste this verbatim, replacing the target path:

```text
You are installing the Xenomoon Forge framework into a React + Node.js web app, using the `webapp` domain.

Context:
- Framework repo = the xenomoon checkout you are running in (this directory).
- Target project = <ABSOLUTE_PATH_TO_YOUR_WEBAPP>  ← a React + Node.js app with a package.json.
- Domain = `webapp`: a Node domain that installs in place, writes nothing into your project, and keeps it pure.

Prefix every shell command with `rtk` (a PreToolUse hook enforces it). Do exactly this:
1. Install framework deps:        rtk npm ci
2. Install into the project:       rtk npm run new -- <ABSOLUTE_PATH_TO_YOUR_WEBAPP> --domain=webapp
   (locks the domain, binds the path in .xenomoon.json, runs doctor)
3. Confirm health:                 rtk npm run doctor   → must report OK for the webapp domain.
4. Boot the UI:                    rtk npm start         → serves http://localhost:3117
5. Verify: open http://localhost:3117 (expect HTTP 200) and check /api/state returns the project's
   name with "found": true.

Do not scaffold, copy, or edit anything inside the target project beyond the framework binding.
Stop and report if `doctor` fails or the `webapp` domain is not found.
```

## What we're trying to do

- **Install per project, deterministically.** `npm run new -- <project> --domain=<name>` installs the framework into a project — new or existing, in place — and writes a committed lock so that project is bound to its domain. The lock is read literally: no agent "what are you building?", no runtime guessing. One install per project; each is independent and **learns that project**.
- **Domain packs from empty to head-start.** A pack ranges from empty (`app`) to a working head-start (`webapp`); either way each install **learns its specific project** and accumulates capabilities — no one-size-fits-all brain.
- **Portable packages.** We're targeting the open [agentskills.io](https://agentskills.io) `SKILL.md` / `SOUL.md` standard — the same one OpenClaw and Hermes already speak — so a package authored once can run on Claude Code today and, later, on those runtimes.
- **Use, don't compete.** We aim to _use_ OpenClaw and Hermes (drive them as workers, or distribute packages onto them), not build a rival runtime.

## Where we are

Early, but real. Working today:

- The spine is **domain-neutral**: it reads per-domain values (project marker, file inventory, capability plugin, orchestrator prompt, build/verify commands) from a **domain pack** instead of hardcoding Godot.
- **Deterministic per-project install**, including into existing **non-greenfield** projects — never scaffolding over your code. A project-owned lock makes the binding deterministic, and a conflicting override is **refused**, not silently applied.
- **Empty packages are valid** — a domain with no pre-baked capabilities installs and runs cleanly.
- The shipped packs are **`webapp`** — a populated React + Node **head-start** (an issue-driven `triage → solution → implement` pipeline whose orchestrator learns the project) — and **`app`**, an empty Node learning pack. Godot is **stripped**: it stays the exclusive upstream product, never a domain here.

Not yet: more domain packs beyond `webapp` / `app`, OpenClaw/Hermes adapters, a package marketplace, and per-project knowledge isolation. The direction and the open seams are written down in [docs/whitelabel/VISION.md](docs/whitelabel/VISION.md) and [docs/whitelabel/SEAMS.md](docs/whitelabel/SEAMS.md).

## Tracking upstream

We follow [arthur0n/xenodot-forge](https://github.com/arthur0n/xenodot-forge) closely, but the flow is **one-way**: we **fetch** its improvements and **never push back** to any `xenodot-forge` repo (a `pre-push` hook hard-blocks that). Our xenomoon trunk is `main`, published **only** to the `xenomoon` remote (`arthur0n/xenomoon`); on each pull we take upstream's curated, domain-agnostic changes (never the engine payload) and re-apply the committed xenomoon rebrand (`scripts/rebrand.mjs`). The workflow is in [docs/whitelabel/SYNC.md](docs/whitelabel/SYNC.md).

## License

[MIT](LICENSE), inherited from upstream.
