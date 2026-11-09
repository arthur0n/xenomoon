---
type: verdicts
title: One static bearer per internal client
description: The internal tools server authenticates each client with its own static bearer token from the secret store, compared in constant time; no OAuth on this internal hop.
status: stable
tags: [mcp, auth, secrets]
source: tools-server 4
generated: { by: human:migrate, at: 2026-09-21T00:00:00Z }
---

The internal tools server authenticates each client with its own static bearer token from the secret store, compared in constant time; no OAuth on this internal hop.

## Why

Simple and enough for a closed internal network; each client can be rotated alone.

## Context

One static bearer per client, loaded from the secret store at boot, checked with a timing-safe compare. Host and Origin guards run before it.

The tools server is reached only by known internal services on the compose network; the harness supports header auth or OAuth for MCP servers.
