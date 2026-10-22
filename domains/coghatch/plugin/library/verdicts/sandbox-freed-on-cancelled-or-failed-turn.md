---
name: sandbox-freed-on-cancelled-or-failed-turn
kind: verdicts
description: A turn that ends cancelled or in error frees its session's sandbox, and so does a cancel on an idle session; a turn that ends done keeps it for follow-ups until the idle reaper.
status: accepted
tags: [agent-forge, sandbox]
date: 2026-10-16
source: forge A53
---

# Free the sandbox on a cancelled or failed turn

## Context

Sandboxes from abandoned turns held VM memory until the idle reaper ran.

## Decision

When a turn's stream ends, if the session's last turn is cancelled or error and no turn of that session is running, the server removes its container. A cancel on a session whose last turn already ended frees it the same way. A done turn keeps its sandbox so a follow-up finds its files.

## Why

Callers that hold their final reply can free resources at once; follow-up turns still work.
