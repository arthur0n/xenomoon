---
name: tool-identity-is-attribution-until-login
kind: verdicts
description: Without login, the user identity the harness passes to tools is the caller's claim, written once at session create and forwarded on every MCP call for attribution only, never for isolation.
status: amended
tags: [agent-forge, mcp, auth, security]
date: 2026-09-28
source: forge A33
---

# Identity to tools is attribution, not isolation

## Context

With no login every request is one subject, so the harness cannot bind a claimed user to its sender. A per-user file check at the tools server would prove nothing about impersonation.

## Decision

The caller's claim is stored on the session at create (shape-checked, never authenticated) and read from the session on every turn, not from a per-turn header lost on continue turns and scheduled runs. The harness forwards it to the tools server as a user header on every MCP connection, under the manifest's own auth headers; Authorization can never be overridden. The tools server records it and enforces nothing.

## Why

Honest labelling: attribution is useful now; isolation needs verified identity first.
