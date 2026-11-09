---
type: verdicts
title: MCP servers split by category
description: One tools process serves several MCP servers by category, each on its own exact path with shared auth and caps, because the harness attaches, filters and preloads tools per connector.
status: stable
tags: [mcp]
source: tools-server 15
generated: { by: human:migrate, at: 2026-10-13T00:00:00Z }
---

One tools process serves several MCP servers by category, each on its own exact path with shared auth and caps, because the harness attaches, filters and preloads tools per connector.

## Why

An agent attaches a category instead of one long list; one repo and one process still suffice.

## Context

One process, one port, one verifier, one set of guards and caps; several MCP servers, one exact path each (general tools, warehouse tools, agent tools). Each server has its own instructions. The bare path, unknown servers and trailing slashes get 404. No alias for the old single path.

The harness attaches a connector by name, and enable, disable and preload are per connector; deferred discovery lists one server's tools.
