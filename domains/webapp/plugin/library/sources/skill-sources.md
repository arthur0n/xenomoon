---
type: source-list
title: "External skill sources — webapp domain"
description: "Registry of external skill collections the researcher (research-skill-gap mode) searches, grouped by subdomain (general / React / Node.js / AWS). Verified sources only; Hermes proposes new entries, the human approves."
---

# External skill sources — webapp domain

Registry the **researcher** (`research-skill-gap` mode) reads first. Nothing here is
bundled — each source is downloaded at runtime to a per-user cache on first use. Cache
root: `$HOME/.cache/xenomoon/` (machine-local, safe to delete — re-downloads on next use).
Never edit files inside a cache; never copy a collection wholesale into the project.

## General agent-skill collections

### superpowers

- **Source**: https://github.com/obra/superpowers (MIT)
- **Cache**: `$HOME/.cache/xenomoon/superpowers`
- **Bootstrap**: `git clone --depth 1 https://github.com/obra/superpowers "$HOME/.cache/xenomoon/superpowers"`
- **Refresh**: `git -C "$HOME/.cache/xenomoon/superpowers" pull --ff-only` — best-effort; offline failure is fine, use the cached copy
- **Layout**: skills in `skills/<name>/SKILL.md` — general software-development methodology skills (testing, debugging, planning), not stack-specific
- **Attribution on adopt**: `Adapted from superpowers (https://github.com/obra/superpowers), MIT License, Copyright (c) Jesse Vincent.`

### anthropics/skills

- **Source**: https://github.com/anthropics/skills (⚠ license varies PER SKILL — check the skill's own directory before adopting; no repo-level grant)
- **Cache**: `$HOME/.cache/xenomoon/anthropic-skills`
- **Bootstrap**: `git clone --depth 1 https://github.com/anthropics/skills "$HOME/.cache/xenomoon/anthropic-skills"`
- **Refresh**: `git -C "$HOME/.cache/xenomoon/anthropic-skills" pull --ff-only` — best-effort
- **Layout**: skills as `<area>/<name>/SKILL.md` (document/office skills + examples)
- **Attribution on adopt**: per the skill's own license file — a skill without a clear adaptation-permitting license is NOT adoptable.

## React

_No verified collection registered yet — dispatch Hermes to research the subdomain
("React skill/pattern collections for agent frameworks") and propose entries below._

## Node.js

_No verified collection registered yet — same: Hermes researches, human approves the entry._

## AWS

_No verified collection registered yet. Note for the `research-tooling` mode:
https://github.com/awslabs/mcp (Apache-2.0) is a verified LIFT source for AWS tooling
(MCP servers) — a tooling candidate, not a skill collection._

## Adding a source

One section per collection: source URL + license, cache path under
`$HOME/.cache/xenomoon/`, bootstrap and refresh commands, layout notes, and the attribution
line adopted skills must carry. **Licenses must permit adaptation** (MIT, Apache-2.0,
CC-BY…); the researcher rewrites — never copies — into `.claude/skills/<name>/`.
New sources enter via the research loop: Hermes finds a candidate → the researcher verifies
repo + license → proposes the registry section → the human approves the edit.
