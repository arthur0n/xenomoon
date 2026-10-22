---
name: tools-server-records-claimed-user
kind: verdicts
description: The tools server records the asking user's header on every connection, file and agent call for attribution, enforces nothing on it, and records an out-of-shape value only as 'invalid', never verbatim.
status: accepted
amends: [tool-identity-is-attribution-until-login]
tags: [mcp, observability, security]
date: 2026-10-02
source: tools-server 5
---

# Tools server records the claimed user

## Context

The harness forwards the session user on every MCP request. The tools server cannot verify it.

## Decision

On every request that passes the host, origin and bearer gates, read the user header and record it: one log line per connection, object metadata on every file written, one line per agent-to-agent call. A missing value is recorded as 'absent' and never mapped to an operator. A value outside the shape the harness enforces (or sent on several lines) is recorded as 'invalid'. Log lines redact emails.

## Why

Attribution without false security; bytes from an unknown sender never reach logs.
