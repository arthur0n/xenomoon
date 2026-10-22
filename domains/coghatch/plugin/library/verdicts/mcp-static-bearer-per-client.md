---
name: mcp-static-bearer-per-client
kind: verdicts
description: The internal tools server authenticates each client with its own static bearer token from the secret store, compared in constant time; no OAuth on this internal hop.
status: accepted
tags: [mcp, auth, secrets]
date: 2026-09-21
source: tools-server 4
---

# One static bearer per internal client

## Context

The tools server is reached only by known internal services on the compose network; the harness supports header auth or OAuth for MCP servers.

## Decision

One static bearer per client, loaded from the secret store at boot, checked with a timing-safe compare. Host and Origin guards run before it.

## Why

Simple and enough for a closed internal network; each client can be rotated alone.
