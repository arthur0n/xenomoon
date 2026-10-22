---
name: mcp-one-server-per-resource
kind: verdicts
description: One MCP server is one OAuth resource, one scope and one consent, and its tool list is built per caller from the ACL, so every present and future agent becomes tools with no per-agent endpoint.
status: amended
amends: [mcp-scopes-per-agent]
tags: [mcp, oauth, auth]
date: 2026-09-10
source: hub M17
---

# One MCP server, agents as per-caller tools

## Context

The first design had one MCP endpoint and one `agent:<name>` scope per agent. The goal is that every
agent, present and future, becomes tools, and that the access hub can host several MCP servers side by
side (agents first, data tools later).

## Decision

- One MCP server = one resource (`/mcp/<server>`), one scope (`mcp:<server>`), one consent. The origin is
  configuration, never a literal.
- The tool list is per caller: for each agent the caller's ACL grants, four tools (`ask_`, `continue_`,
  `get_result_`, `read_file_` plus the agent name). An ungranted agent is absent, not refused. A caller
  with no access at all gets 403, an unreadable store 503; never an empty 200.
- A job belongs to one agent; a handle used under another agent's tool is "not found".
- A request carrying extra scopes is narrowed to the server's scope (RFC 6749 3.3) and the response says
  so; a request without the server's scope is refused.
- Audience is exact equality, so old per-agent tokens do not carry over.
- Tool descriptions come from the agent's own config; the access hub writes only sequencing hints.

## Why

Per-agent consent inside one server is not the omnibus grant warned against: one server is one coherent
privilege, and which agents are reachable is access control, not consent. Not adopted: advertising agent
scopes in public metadata (it enumerates agent names unauthenticated).

Amended later: the agent catalog is no longer read from the upstream at boot (`access-hub-fronts-agent-harness-ui`).
