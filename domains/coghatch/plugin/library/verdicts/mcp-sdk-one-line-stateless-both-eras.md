---
type: verdicts
title: One MCP SDK line, both protocol eras
description: Every MCP server uses one SDK major line, with the legacy stateless mode on so clients of both the older and the newer protocol era work.
status: stable
tags: [mcp, deps]
source: tools-server 2
generated: { by: human:migrate, at: 2026-09-21T00:00:00Z }
---

Every MCP server uses one SDK major line, with the legacy stateless mode on so clients of both the older and the newer protocol era work.

## Why

One SDK to know and patch; both client eras were proven against it before this choice.

## Context

Use the same MCP server SDK major version across our MCP servers, with the legacy stateless option on.

The harness ships an older MCP client; other clients use the newer protocol.
