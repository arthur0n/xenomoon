---
type: verdicts
title: Tell the model which tools are preloaded
description: The harness's deferred-tools instruction must name a server's preloaded tools as directly callable, or the model keeps running discovery on them.
status: stable
amends: [preload-most-used-tools]
tags: [agent-forge, mcp, llm]
source: forge A27
generated: { by: human:migrate, at: 2026-09-26T00:00:00Z }
---

The harness's deferred-tools instruction must name a server's preloaded tools as directly callable, or the model keeps running discovery on them.

## Why

Measured: preloading without the instruction change raised input tokens and saved no calls.

## Context

The instruction lists a server's preloaded tools as directly callable and keeps the discovery rule only for the rest.

After preloading, the schemas reached the model but it still ran discovery and called the tools through the generic call tool: the upstream instruction said every tool of a non-preloaded server must be discovered first.
