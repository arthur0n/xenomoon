---
name: web-search-two-tools-distinct-names
kind: verdicts
description: Internet search is two tools with distinct names — the model provider's built-in web search, enabled per agent, and the tools server's search-results tool; the agent prompt says which to use when.
status: accepted
tags: [agent-forge, mcp, llm]
date: 2026-10-19
source: forge A54
---

# Two web search tools, two names

## Context

One tool name for two different search mechanisms would let the harness rename or shadow one silently and leave the model guessing.

## Decision

The provider's built-in search keeps the name web_search and is switched on per agent; the agent's model must be from that provider (else 422, also checked at startup). The tools server's own search has a different name. Each description says what it is; the prompt says when to use which.

## Why

Distinct names and descriptions let the model pick on purpose.
