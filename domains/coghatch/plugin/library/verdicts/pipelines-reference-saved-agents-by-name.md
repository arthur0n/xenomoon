---
name: pipelines-reference-saved-agents-by-name
kind: verdicts
description: Every pipeline call references its saved agent by name and sends no inline agent spec, so the harness alone holds the prompts.
status: accepted
amends: [pipeline-sessions-tagged-and-hidden]
tags: [agent-forge, workflow-engine]
date: 2026-09-28
source: forge A29
---

# Pipelines reference saved agents by name

## Context

Running pipeline-only agents as inline sessions made the pipeline repo the holder of their prompt bytes (a copy, a runtime fetch, or a new route).

## Decision

All agents are saved in the harness. A pipeline sends only a reference by name; the server still accepts inline specs, but the caller rule forbids them and the pipeline's tests pin it. Pipeline-only agents may show in the UI for now. The source tag and history filter stay.

## Why

One owner for every prompt. The visibility cost was cosmetic while the only user was the owner.
