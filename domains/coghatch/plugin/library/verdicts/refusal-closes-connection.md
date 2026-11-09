---
type: verdicts
title: A refusal closes its connection
description: Every refusal the MCP server writes before the request body is fully read answers with Connection — close, so a client cannot keep sending on a refused connection; passing requests keep keep-alive.
status: stable
tags: [mcp, network, security]
source: tools-server 17
generated: { by: human:migrate, at: 2026-10-20T00:00:00Z }
---

Every refusal the MCP server writes before the request body is fully read answers with Connection — close, so a client cannot keep sending on a refused connection; passing requests keep keep-alive.

## Why

Node closes cleanly when told by the header; the surface destroys nothing by hand.

## Context

Host, origin, bearer, body-size, timeout and unreadable-body refusals set Connection: close and let Node close the socket after the answer. Successful answers keep Node's own keep-alive headers. A bounded drain was rejected as too complex for a macOS-only symptom.

Keep-alive plus a manual socket destroy made every second request from a pooled client fail with a hang-up.
