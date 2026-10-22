---
name: preload-most-used-tools
kind: verdicts
description: An agent preloads the few MCP tools it uses on most turns and keeps the rest deferred, trading input tokens for fewer discovery round trips.
status: amended
tags: [agent-forge, mcp, llm]
date: 2026-09-26
source: forge A23
---

# Preload the tools used on most turns

## Context

With upstream defaults every tool was deferred: the model spent one discovery call per tool before using it (half its model calls on one measured turn).

## Decision

Each agent lists its most-used tools as preloaded on the server entry; the rest stay deferred.

## Why

Fewer round trips and faster answers for a known cost in input tokens per call.
