---
name: mcp-sdk-one-line-stateless-both-eras
kind: verdicts
description: Every MCP server uses one SDK major line, with the legacy stateless mode on so clients of both the older and the newer protocol era work.
status: accepted
tags: [mcp, deps]
date: 2026-09-21
source: tools-server 2
---

# One MCP SDK line, both protocol eras

## Context

The harness ships an older MCP client; other clients use the newer protocol.

## Decision

Use the same MCP server SDK major version across our MCP servers, with the legacy stateless option on.

## Why

One SDK to know and patch; both client eras were proven against it before this choice.
