---
name: tools-server-own-deployable
kind: verdicts
description: Agent tools live in their own repo and deployable, an MCP server running as a compose service beside the harness, so tools survive a harness swap.
status: accepted
tags: [mcp, infra]
date: 2026-09-21
source: tools-server 1
---

# Tools in their own MCP server

## Context

The old runtime carried its tools in-process. The new harness attaches tools through MCP.

## Decision

One repo and one deployable for the tools, run as a compose service on the VM next to the harness and reached over the compose network.

## Why

Tools behind a protocol survive a harness change, and the secrets they need stay on the VM.
