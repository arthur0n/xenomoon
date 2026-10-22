---
name: service-to-service-token-via-workload-federation
kind: verdicts
description: The tools server calls the harness with an Entra app-only token whose client assertion is the VM's own cloud ID token, so no client secret exists; a 401 forces one refresh and one replay.
status: accepted
tags: [auth, security, mcp]
date: 2026-10-01
source: tools-server 12
---

# Service token by federation, no client secret

## Context

The harness now authenticates every caller with identity-provider tokens; the tools server must call it as a machine.

## Decision

Mint the token with client credentials, using the VM metadata server's ID token (audience: the identity provider's token-exchange audience) as the client assertion. One token cache per source. Every request carries the bearer; a caller-supplied authorization header is dropped. On a 401, refresh once and replay once. A refused mint throws one fixed error with no provider text; diagnostics are logged server-side only. Tenant, client id and scope are config, not secrets; a missing one is a boot error.

## Why

No secret to rotate or leak; replay is safe because the 401 comes from the auth gate before any route runs.
