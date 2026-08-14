---
type: source-list
title: "External skill sources — expoapp domain"
description: "Registry of VENDOR-OFFICIAL skill repos the researcher (research-skill-gap mode) searches — the tool's own skills repo is the authoritative direction when an agent struggles with that tool. Hermes proposes new entries, the human approves."
---

# External skill sources — expoapp domain

Registry the **researcher** (`research-skill-gap` mode) reads first. **The model: when an
agent struggles with a stack tool, that tool VENDOR's own skills repo is the authoritative
direction** (e.g. trouble with Clerk → `clerk/skills`). Generic "skill collections" are NOT
wanted here: methodology skills overlap what the framework already teaches, and bulk
collections invite bloat.

Nothing here is bundled — each source is downloaded at runtime to a per-user cache on first
use. Cache root: `$HOME/.cache/xenomoon/` (machine-local, safe to delete — re-downloads on
next use). Never edit files inside a cache; never copy a collection wholesale into the
project. Adoption is always: ONE skill, the slice that fills the gap, rewritten to the
project's conventions, human-approved.

**Sections are the subdomains a mobile gap actually lands in** — Expo/EAS, React Native,
native platform tooling, E2E, auth. An empty section is not an oversight: entries earn their
place when a real gap fires, never by pre-stocking plausible repos.

## Expo / EAS

_No entry yet. Expo and EAS gaps go to the vendor's own skills repo once one is verified to
exist and publish under a usable license — Hermes researches the candidate, the researcher
verifies repo + publisher + license, the human approves the section. Until then: the
official docs plus `eas --help` are the source, and a recurring gap is a signal to author a
project-local skill rather than adopt a third-party collection._

## React Native

_No entry yet — same rule: vendor-official first, Hermes researches, the human approves._

## Native platform tooling (Xcode / Android SDK)

_No entry yet. These gaps are CLI territory — the harness convention: **CLI + tools + KB
first** (`research-tooling` mode wraps the CLI thin and deterministic); an MCP server is
created ONLY when a gap is proven unsolvable deterministically (live/stateful against a
running process). Never reach for an MCP server while `xcrun`, `simctl`, `adb` or `gradle`
can cover the need._

## E2E — Maestro

_No entry yet. The pack's own `ios-local-uat` / `android-local-uat` skills already carry the
run discipline; register a source here only if a gap survives them._

## Auth — Clerk

### clerk/skills (vendor-official)

- **Source**: https://github.com/clerk/skills — Clerk's own AI skills repo ("AI Skills to
  enhance working with Clerk"). ⚠ No repo-level LICENSE file: published by the vendor for
  exactly this use, but on adopt keep the rewrite thin, carry attribution, and re-check the
  repo for a license before shipping anything derived beyond the project.
- **Cache**: `$HOME/.cache/xenomoon/clerk-skills`
- **Bootstrap**: `git clone --depth 1 https://github.com/clerk/skills "$HOME/.cache/xenomoon/clerk-skills"`
- **Refresh**: `git -C "$HOME/.cache/xenomoon/clerk-skills" pull --ff-only` — best-effort; offline failure is fine, use the cached copy
- **Layout**: `skills/{core,features,frameworks,mobile}/<name>/` — for this domain the
  `mobile/` group is the relevant slice (Expo); `core/` covers setup/CLI/backend-API.
- **Attribution on adopt**: `Adapted from Clerk's official skills (https://github.com/clerk/skills), Copyright (c) Clerk.`

## Adding a source

One section per source, under its subdomain: source URL + license (or the vendor-official
caveat), cache path under `$HOME/.cache/xenomoon/`, bootstrap and refresh commands, layout
notes, and the attribution line adopted skills must carry. **Vendor-official repos are the
bar** — a tool's own skills repo beats any third-party collection; generic methodology
collections are rejected by default. New sources enter via the research loop: Hermes finds
the candidate → the researcher verifies repo + publisher + license → proposes the section →
the human approves the edit.
