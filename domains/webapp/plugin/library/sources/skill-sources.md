---
type: sources
title: "External skill sources — webapp domain"
description: "Registry of VENDOR-OFFICIAL skill repos the researcher (research-skill-gap mode) searches — the tool's own skills repo is the authoritative direction when an agent struggles with that tool. Hermes proposes new entries, the human approves."
generated: { by: human:migrate, at: 2026-11-08T00:00:00Z }
---

Registry of VENDOR-OFFICIAL skill repos the researcher (research-skill-gap mode) searches — the tool's own skills repo is the authoritative direction when an agent struggles with that tool. Hermes proposes new entries, the human approves.

## Why

Registry of VENDOR-OFFICIAL skill repos the researcher (research-skill-gap mode) searches — the tool's own skills repo is the authoritative direction when an agent struggles with that tool. Hermes proposes new entries, the human approves.

## Context

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

**Auth — Clerk**

### clerk/skills (vendor-official)

- **Source**: https://github.com/clerk/skills — Clerk's own AI skills repo ("AI Skills to
  enhance working with Clerk"). ⚠ No repo-level LICENSE file: published by the vendor for
  exactly this use, but on adopt keep the rewrite thin, carry attribution, and re-check the
  repo for a license before shipping anything derived beyond the project.
