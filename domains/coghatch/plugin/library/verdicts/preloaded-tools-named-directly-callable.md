---
name: preloaded-tools-named-directly-callable
kind: verdicts
description: The harness's deferred-tools instruction must name a server's preloaded tools as directly callable, or the model keeps running discovery on them.
status: amended
amends: [preload-most-used-tools]
tags: [agent-forge, mcp, llm]
date: 2026-09-26
source: forge A27
---

# Tell the model which tools are preloaded

## Context

After preloading, the schemas reached the model but it still ran discovery and called the tools through the generic call tool: the upstream instruction said every tool of a non-preloaded server must be discovered first.

## Decision

The instruction lists a server's preloaded tools as directly callable and keeps the discovery rule only for the rest.

## Why

Measured: preloading without the instruction change raised input tokens and saved no calls.
