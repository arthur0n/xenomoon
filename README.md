# Xenomoon

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Status: experimental](https://img.shields.io/badge/Status-experimental-orange.svg)

> **Early experiment.** A white-label fork of [Xenodot Forge](https://github.com/arthur0n/xenodot-forge). Names, layouts, and APIs will change; nothing here is stable yet.

## What this is

Xenomoon is a Claude Code framework that drives a deliberate, human-gated pipeline — **designer → dev → verify → you** — instead of a chat box. It's **domain-neutral**: you install it per project, lock it to a domain, and it runs that same pipeline for whatever you're building — games, apps, anything.

Godot is just the reference domain we forked from — not one of our products.

## What we're trying to do

- **Install per project, deterministically.** `npm run new -- <project> --domain=<name>` installs the framework into a project — new or existing, in place — and writes a committed lock so that project is bound to its domain. The lock is read literally: no agent "what are you building?", no runtime guessing. One install per project; each is independent and **learns that project**.
- **Domain packages that start empty.** A domain (e.g. `app`) begins at zero and accumulates capabilities as it learns the project — no one-size-fits-all brain.
- **Portable packages.** We're targeting the open [agentskills.io](https://agentskills.io) `SKILL.md` / `SOUL.md` standard — the same one OpenClaw and Hermes already speak — so a package authored once can run on Claude Code today and, later, on those runtimes.
- **Use, don't compete.** We aim to _use_ OpenClaw and Hermes (drive them as workers, or distribute packages onto them), not build a rival runtime.

## Where we are

Early, but real. Working today:

- The spine is **domain-neutral**: it reads per-domain values (project marker, file inventory, capability plugin, orchestrator prompt, build/verify commands) from a **domain pack** instead of hardcoding Godot.
- **Deterministic per-project install**, including into existing **non-greenfield** projects — never scaffolding over your code. A project-owned lock makes the binding deterministic, and a conflicting override is **refused**, not silently applied.
- **Empty packages are valid** — a domain with no pre-baked capabilities installs and runs cleanly.
- The reference **`godot`** domain reproduces upstream behavior exactly (its onboarding gate stays green). An empty **`app`** domain (Node) is the first non-game package.

Not yet: real package content (`app` / `salesforce` are empty), OpenClaw/Hermes adapters, a package marketplace, and per-project knowledge isolation. The direction and the open seams are written down in [docs/whitelabel/VISION.md](docs/whitelabel/VISION.md) and [docs/whitelabel/SEAMS.md](docs/whitelabel/SEAMS.md).

## Tracking upstream

We follow [arthur0n/xenodot-forge](https://github.com/arthur0n/xenodot-forge) closely: `main` mirrors upstream, our work lands additively on `forge`, and the xenomoon rebrand is a regenerable build step (`scripts/rebrand.mjs`) rather than committed edits — so we can keep pulling upstream improvements as it grows. The workflow is in [docs/whitelabel/SYNC.md](docs/whitelabel/SYNC.md).

## License

[MIT](LICENSE), inherited from upstream.
