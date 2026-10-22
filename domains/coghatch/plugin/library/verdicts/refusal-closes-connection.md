---
name: refusal-closes-connection
kind: verdicts
description: Every refusal the MCP server writes before the request body is fully read answers with Connection — close, so a client cannot keep sending on a refused connection; passing requests keep keep-alive.
status: accepted
tags: [mcp, network, security]
date: 2026-10-20
source: tools-server 17
---

# A refusal closes its connection

## Context

Keep-alive plus a manual socket destroy made every second request from a pooled client fail with a hang-up.

## Decision

Host, origin, bearer, body-size, timeout and unreadable-body refusals set Connection: close and let Node close the socket after the answer. Successful answers keep Node's own keep-alive headers. A bounded drain was rejected as too complex for a macOS-only symptom.

## Why

Node closes cleanly when told by the header; the surface destroys nothing by hand.
