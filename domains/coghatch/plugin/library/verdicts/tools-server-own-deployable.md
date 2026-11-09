---
type: verdicts
title: Tools in their own MCP server
description: Agent tools live in their own repo and deployable, an MCP server running as a compose service beside the harness, so tools survive a harness swap.
status: stable
tags: [mcp, infra]
source: tools-server 1
generated: { by: human:migrate, at: 2026-09-21T00:00:00Z }
---

Agent tools live in their own repo and deployable, an MCP server running as a compose service beside the harness, so tools survive a harness swap.

## Why

Tools behind a protocol survive a harness change, and the secrets they need stay on the VM.

## Context

One repo and one deployable for the tools, run as a compose service on the VM next to the harness and reached over the compose network.

The old runtime carried its tools in-process. The new harness attaches tools through MCP.
