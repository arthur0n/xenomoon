---
type: source-list
title: "External skill sources — webapp domain"
description: "Registry of VENDOR-OFFICIAL skill repos the researcher (research-skill-gap mode) searches — the tool's own skills repo is the authoritative direction when an agent struggles with that tool. Hermes proposes new entries, the human approves."
---

# External skill sources — webapp domain

Registry the **researcher** (`research-skill-gap` mode) reads first. **The model: when an
agent struggles with a stack tool, that tool VENDOR's own skills repo is the authoritative
direction** (e.g. trouble with Clerk → `clerk/skills`) — the same pattern as the prompter
source on xenodot. Generic "skill collections" are NOT wanted here: methodology skills
overlap what the framework already teaches, and bulk collections invite bloat.

Nothing here is bundled — each source is downloaded at runtime to a per-user cache on first
use. Cache root: `$HOME/.cache/xenomoon/` (machine-local, safe to delete — re-downloads on
next use). Never edit files inside a cache; never copy a collection wholesale into the
project. Adoption is always: ONE skill, the slice that fills the gap, rewritten to the
project's conventions, human-approved.

## Auth — Clerk

### clerk/skills (vendor-official)

- **Source**: https://github.com/clerk/skills — Clerk's own AI skills repo ("AI Skills to
  enhance working with Clerk"). ⚠ No repo-level LICENSE file: published by the vendor for
  exactly this use, but on adopt keep the rewrite thin, carry attribution, and re-check the
  repo for a license before shipping anything derived beyond the project.
- **Cache**: `$HOME/.cache/xenomoon/clerk-skills`
- **Bootstrap**: `git clone --depth 1 https://github.com/clerk/skills "$HOME/.cache/xenomoon/clerk-skills"`
- **Refresh**: `git -C "$HOME/.cache/xenomoon/clerk-skills" pull --ff-only` — best-effort; offline failure is fine, use the cached copy
- **Layout**: `skills/{core,features,frameworks,mobile}/<name>/` — core setup/CLI/backend-API,
  feature guides, per-framework (Next.js etc.), mobile (Expo)
- **Attribution on adopt**: `Adapted from Clerk's official skills (https://github.com/clerk/skills), Copyright (c) Clerk.`

## React

_No entry yet. When a real gap fires, prefer the involved tool vendor's official skills
repo; Hermes researches candidates, the human approves the entry below._

## Node.js

_No entry yet — same rule: vendor-official first, Hermes researches, human approves._

## AWS

_No entry yet. AWS gaps are `aws` CLI territory — the harness convention: **CLI + tools +
KB first** (`research-tooling` mode wraps the CLI thin, deterministic); MCP is created ONLY
when a gap is proven unsolvable deterministically (live/stateful against a running
process). Never reach for an MCP server while a CLI can cover the need._

## Adding a source

One section per source, under its subdomain: source URL + license (or the vendor-official
caveat), cache path under `$HOME/.cache/xenomoon/`, bootstrap and refresh commands, layout
notes, and the attribution line adopted skills must carry. **Vendor-official repos are the
bar** — a tool's own skills repo beats any third-party collection; generic methodology
collections are rejected by default. New sources enter via the research loop: Hermes finds
the candidate → the researcher verifies repo + publisher + license → proposes the section →
the human approves the edit.
