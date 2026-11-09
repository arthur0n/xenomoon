---
type: verdicts
title: Pipelines reference saved agents by name
description: Every pipeline call references its saved agent by name and sends no inline agent spec, so the harness alone holds the prompts.
status: stable
amends: [pipeline-sessions-tagged-and-hidden]
tags: [agent-forge, workflow-engine]
source: forge A29
generated: { by: human:migrate, at: 2026-09-28T00:00:00Z }
---

Every pipeline call references its saved agent by name and sends no inline agent spec, so the harness alone holds the prompts.

## Why

One owner for every prompt. The visibility cost was cosmetic while the only user was the owner.

## Context

All agents are saved in the harness. A pipeline sends only a reference by name; the server still accepts inline specs, but the caller rule forbids them and the pipeline's tests pin it. Pipeline-only agents may show in the UI for now. The source tag and history filter stay.

Running pipeline-only agents as inline sessions made the pipeline repo the holder of their prompt bytes (a copy, a runtime fetch, or a new route).
