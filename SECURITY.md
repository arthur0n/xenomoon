# Security Policy

## Reporting a vulnerability

Please report vulnerabilities **privately** — do not open a public issue or PR
that demonstrates an exploit.

- Preferred: [GitHub private vulnerability reporting](https://github.com/arthur0n/xenodot-forge/security/advisories/new)

Include what you found, where (file/path), and how to reproduce it. This is a
small, single-maintainer open-source project (a proof of concept) — there is no
bug bounty, but reporters get credited in the fix unless they prefer not to be.
Please allow a reasonable window for a fix before any public disclosure.

## Scope

- This repository — the framework spine (`ui/`, `.claude/`) and the shipped
  **xenomoon** plugin (`plugin/`).
- **Out of scope:** your own Godot game. The framework only _reads_ an external
  game project in place and never tracks it, so a game's secrets are the game
  repo's responsibility, not this one's.

## Supported versions

Only `main` (the latest tagged release cut from it) receives fixes. This is a POC
— APIs, layouts, and prompts change without notice.

## Security model

What a change must never weaken:

- **Human in the loop is the invariant.** Provider, model, and any outer
  orchestrator are swappable; the approval gates, the designer interview, and the
  human-run `promote` are not. Every tool call and every delegated worker
  (Hermes, Codex) passes a human approval gate before it counts.
- **No secrets in the repo.** The Hive runs on your local Claude Code login (or
  `ANTHROPIC_API_KEY` in your environment); optional Hermes/Codex rails keep their
  keys in their own tool configs (`CODEX_HOME`, Hermes setup), never committed.
  The saved game path (`.xenomoon.json`), vendored plugins (`vendor/`), and run
  records (`.xenomoon-run/`) are gitignored. Any local `.env` is gitignored; the
  only committed env files are `*.example` placeholders.
- **The framework never writes to your game without a gate.** It reads the game
  in place; materialized per-game files (`tools/`, `library/`) are gitignored and
  regenerated on demand, so the committed game stays pure.
- **Projects stay separate; a hostile person on the owner's machine is out of scope.** Each
  project has its own settings (`<project>/.xenomoon/settings.json`: the `onboarded` mark and
  the approvals), its own client data and its own names, and one project does not reach into
  another; the framework and what is learned for it are shared. The framework runs locally as
  the owner, and whoever can write inside a project folder can already write that project's own
  settings, so code against deliberate symlinks, hard links or races between project folders is
  not built. Owner, 2026-11-13: "in that point is not attacker."
- **A project server is for this machine only.** It listens on `127.0.0.1`.
  Every route except the two status routes answers 403 to a request whose Host is not
  `localhost` or `127.0.0.1`, with or without a port. The page files are among these routes.
  Each of them also answers 403 to a request that carries an Origin other than exactly
  `http://<Host>`. A request with no Origin is accepted. Every answer of the page files carries
  `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`, so a browser
  shows no project page inside a frame. The session socket accepts an upgrade on `/` only, and
  answers 400 to any other path. It applies the same Host and Origin rule (403) before a session
  opens or is re-attached. The two status routes change no state. They refuse a Host that is not
  `localhost` or `127.0.0.1`, and a request that carries an Origin never receives the last
  conversation line. A program on the owner's machine that sets these headers itself passes; that
  is the hostile-person line above. Known limit: a foreign page can send the browser to a project
  address, as a link does; the project page then opens a new session by itself, which the foreign
  page can neither read nor write to. Owner, 2026-11-25, on accepting it: "1".
- **Secret scanning.** gitleaks scans staged changes pre-commit
  (`.husky/pre-commit`) and the full history in CI
  (`.github/workflows/gitleaks.yml`); config + allowlist in `.gitleaks.toml`.

If you find a way around any of these, that's exactly the report we want.
