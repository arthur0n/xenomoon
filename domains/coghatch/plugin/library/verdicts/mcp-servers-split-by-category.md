---
name: mcp-servers-split-by-category
kind: verdicts
description: One tools process serves several MCP servers by category, each on its own exact path with shared auth and caps, because the harness attaches, filters and preloads tools per connector.
status: accepted
tags: [mcp]
date: 2026-10-13
source: tools-server 15
---

# MCP servers split by category

## Context

The harness attaches a connector by name, and enable, disable and preload are per connector; deferred discovery lists one server's tools.

## Decision

One process, one port, one verifier, one set of guards and caps; several MCP servers, one exact path each (general tools, warehouse tools, agent tools). Each server has its own instructions. The bare path, unknown servers and trailing slashes get 404. No alias for the old single path.

## Why

An agent attaches a category instead of one long list; one repo and one process still suffice.
