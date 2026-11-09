---
type: sources
title: "External skill sources — expoapp domain"
description: "Registry of VENDOR-OFFICIAL skill repos the researcher (research-skill-gap mode) searches — the tool's own skills repo is the authoritative direction when an agent struggles with that tool. Hermes proposes new entries, the human approves."
generated: { by: human:migrate, at: 2026-11-08T00:00:00Z }
---

Registry of VENDOR-OFFICIAL skill repos the researcher (research-skill-gap mode) searches — the tool's own skills repo is the authoritative direction when an agent struggles with that tool. Hermes proposes new entries, the human approves.

## Why

Registry of VENDOR-OFFICIAL skill repos the researcher (research-skill-gap mode) searches — the tool's own skills repo is the authoritative direction when an agent struggles with that tool. Hermes proposes new entries, the human approves.

## Context

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

**Expo / EAS**

\_No entry yet. Expo and EAS gaps go to the vendor's own skills repo once one is verified to
exist and publish under a usable license — Hermes researches the candidate, the researcher
