---
name: oauth-opaque-access-tokens
kind: verdicts
description: Access tokens are opaque reference tokens, not JWTs, because revocation must be real and the authorization server and resource server are one process.
status: accepted
tags: [oauth, auth, mcp, security]
date: 2026-09-03
source: hub M3
---

# Opaque access tokens, not JWTs

## Context

The access hub is both the authorization server and the MCP resource server, in one process on one store.
ASVS 10.4.9 (L2) requires the user to be able to revoke refresh tokens and reference access tokens.

## Decision

Access tokens are opaque (reference) tokens; revoking one deletes its record. The library (`oidc-provider`)
still needs a signing key to accept any client, so an ES256 key is generated at boot, kept in memory and
never persisted. It signs nothing: the `openid` scope is refused at authorize and cannot reach issuance,
and both walls are tested. `openid`, `jwks_uri` and the id-token signing algorithms are trimmed from the
discovery documents, because clients request every OIDC scope a server advertises.

## Why

- A JWT cannot be revoked without a denylist; an opaque token is revoked by deleting it.
- JWTs exist so a remote resource server can validate without calling the issuer. There is no remote one.
- Opaque is the library's own default.
- No key in a secret store, no rotation runbook, no algorithm allowlist, no `alg:none` class of bug.
  Cost: one store read per MCP request, on a request that already reads the store for the ACL.
- Re-open only if the MCP endpoints move to a separate service; RFC 7662 introspection is the exit.
