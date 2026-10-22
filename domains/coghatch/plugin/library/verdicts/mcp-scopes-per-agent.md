---
name: mcp-scopes-per-agent
kind: verdicts
description: MCP scopes and consent are per agent, never one grant over the whole access list; raw tools for power users are deferred to a later phase.
status: amended
tags: [mcp, oauth, auth]
date: 2026-09-03
source: hub M4
---

# Per-agent scopes, raw tools later

## Context

Employees reach agents through MCP clients. Some power users may later want specialised raw tools. MCP's
security best practices name bundling unrelated privileges into one consent as a common mistake.

## Decision

- Scope vocabulary `agent:<name>`, one per agent, covering every tool that agent exposes.
- Consent is per agent; a user never consents to "everything in my ACL".
- `tools:<name>` scopes and per-tool exposure are deferred to a later phase, together with step-up
  authentication for raw tools.

## Why

Employees talk to agents; specialised tools are a later need. Per-agent consent cannot produce the omnibus
grant the best practices warn about.

Amended: the scope unit became the MCP server, with agents inside it decided by the ACL (see
`mcp-one-server-per-resource`).
