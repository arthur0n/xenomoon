---
type: verdicts
title: Preload the tools used on most turns
description: An agent preloads the few MCP tools it uses on most turns and keeps the rest deferred, trading input tokens for fewer discovery round trips.
status: stable
tags: [agent-forge, mcp, llm]
source: forge A23
generated: { by: human:migrate, at: 2026-09-26T00:00:00Z }
---

An agent preloads the few MCP tools it uses on most turns and keeps the rest deferred, trading input tokens for fewer discovery round trips.

## Why

Fewer round trips and faster answers for a known cost in input tokens per call.

## Context

Each agent lists its most-used tools as preloaded on the server entry; the rest stay deferred.

With upstream defaults every tool was deferred: the model spent one discovery call per tool before using it (half its model calls on one measured turn).
