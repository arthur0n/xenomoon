---
type: verdicts
title: Free the sandbox on a cancelled or failed turn
description: A turn that ends cancelled or in error frees its session's sandbox, and so does a cancel on an idle session; a turn that ends done keeps it for follow-ups until the idle reaper.
status: stable
tags: [agent-forge, sandbox]
source: forge A53
generated: { by: human:migrate, at: 2026-10-16T00:00:00Z }
---

A turn that ends cancelled or in error frees its session's sandbox, and so does a cancel on an idle session; a turn that ends done keeps it for follow-ups until the idle reaper.

## Why

Callers that hold their final reply can free resources at once; follow-up turns still work.

## Context

When a turn's stream ends, if the session's last turn is cancelled or error and no turn of that session is running, the server removes its container. A cancel on a session whose last turn already ended frees it the same way. A done turn keeps its sandbox so a follow-up finds its files.

Sandboxes from abandoned turns held VM memory until the idle reaper ran.
