---
type: verdicts
title: Identity to tools is attribution, not isolation
description: Without login, the user identity the harness passes to tools is the caller's claim, written once at session create and forwarded on every MCP call for attribution only, never for isolation.
status: stable
tags: [agent-forge, mcp, auth, security]
source: forge A33
generated: { by: human:migrate, at: 2026-09-28T00:00:00Z }
---

Without login, the user identity the harness passes to tools is the caller's claim, written once at session create and forwarded on every MCP call for attribution only, never for isolation.

## Why

Honest labelling: attribution is useful now; isolation needs verified identity first.

## Context

The caller's claim is stored on the session at create (shape-checked, never authenticated) and read from the session on every turn, not from a per-turn header lost on continue turns and scheduled runs. The harness forwards it to the tools server as a user header on every MCP connection, under the manifest's own auth headers; Authorization can never be overridden. The tools server records it and enforces nothing.

With no login every request is one subject, so the harness cannot bind a claimed user to its sender. A per-user file check at the tools server would prove nothing about impersonation.
