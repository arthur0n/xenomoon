---
type: verdicts
title: Tool section generated from the agent config
description: The harness writes each agent's tool section from the agent's config (preloaded tools and the complete server list), and a server-not-found error names the agent's servers; prompts are never edited per tool.
status: stable
amends: [preloaded-tools-named-directly-callable]
tags: [agent-forge, mcp, llm]
source: forge A40
generated: { by: human:migrate, at: 2026-10-03T00:00:00Z }
---

The harness writes each agent's tool section from the agent's config (preloaded tools and the complete server list), and a server-not-found error names the agent's servers; prompts are never edited per tool.

## Why

The prompt stays stable when tools change, and the model gets a way back from a wrong guess.

## Context

The harness writes two blocks into the instruction: the preloaded tools by name with their server, and every MCP server the agent can reach, stated as the only servers. A server-not-found error lists the valid servers.

An agent with a deferred tool guessed server names, got not-found each time, and reported an outage to its caller. Editing the prompt for each new tool does not scale.
