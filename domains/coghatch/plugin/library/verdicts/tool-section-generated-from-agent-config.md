---
name: tool-section-generated-from-agent-config
kind: verdicts
description: The harness writes each agent's tool section from the agent's config (preloaded tools and the complete server list), and a server-not-found error names the agent's servers; prompts are never edited per tool.
status: accepted
amends: [preloaded-tools-named-directly-callable]
tags: [agent-forge, mcp, llm]
date: 2026-10-03
source: forge A40
---

# Tool section generated from the agent config

## Context

An agent with a deferred tool guessed server names, got not-found each time, and reported an outage to its caller. Editing the prompt for each new tool does not scale.

## Decision

The harness writes two blocks into the instruction: the preloaded tools by name with their server, and every MCP server the agent can reach, stated as the only servers. A server-not-found error lists the valid servers.

## Why

The prompt stays stable when tools change, and the model gets a way back from a wrong guess.
