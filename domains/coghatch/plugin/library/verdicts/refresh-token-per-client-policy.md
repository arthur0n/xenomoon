---
name: refresh-token-per-client-policy
kind: verdicts
description: A refresh token is issued when the client's own metadata allows the refresh_token grant, not on the offline_access scope, which is never granted or advertised; rotation with family revocation is the required replay control.
status: accepted
tags: [oauth, mcp, security]
date: 2026-09-04
source: hub M14
---

# Refresh tokens on per-client policy, not offline_access

## Context

`oidc-provider` by default issues a refresh token only when `offline_access` is granted, and it strips that
scope unless `prompt=consent` is also sent. With one resource scope per grant, no refresh token was ever
issued, so a 300 s access token meant a full login and consent every five minutes.

## Decision

Override `issueRefreshToken`: issue a refresh token when the client's CIMD lists the `refresh_token`
grant, with no scope condition. Do not grant or advertise `offline_access`. Do not default `grant_types`
for clients, so a document that omits the grant gets nothing. Rotate refresh tokens and revoke the whole
family on reuse.

## Why

- OIDC Core 11 defines `offline_access` for UserInfo access, which this server does not have, and says
  refresh tokens may be granted in other contexts.
- The MCP authorization spec says servers should not put `offline_access` in resource metadata and that
  clients should list `refresh_token` in `grant_types`, which is what this policy reads.
- RFC 9700 4.14.2: servers decide per client, and must detect replay for public clients by
  sender-constraining or rotation. Sender-constraining is impossible here, so rotation is owed.
- Consequence kept on purpose: refresh tokens are session-bound, so an access hub logout, a session
  lapse or a re-authorization ends the client's refresh chain. The UX cost (signing out disconnects
  every MCP client) awaits the owner's confirmation.
