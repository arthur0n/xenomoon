---
name: mcp-tool-names-prefixed-per-server
kind: verdicts
description: Tool names carry their MCP server's prefix and each MCP server has its own path, because the agent harness silently renames duplicate tool names across connectors and breaks enabled-tool lists with no error.
status: accepted
tags: [mcp, agent-forge]
date: 2026-10-13
source: platform D33
---

# Prefixed tool names, one path per MCP server

## Context

The MCP tools server hosts several MCP servers in one process. TrueForge silently renames duplicate names
across connectors, which broke an agent's enabled tools with no error.

## Decision

Each server has its own path (`/mcp/<server>`) and every tool is `<prefix>_<verb_object>` with its server's
prefix. The migration was done in one window: no alias, no old name and no old path kept anywhere.

## Why

- Unique names make enabled-tool lists stable.
- The no-alias rule is the owner's rule, not a gate check; nothing scans for old names.
