---
type: verdicts
title: The access hub is the authorization server, and so the crown jewels
description: The access hub is a full OAuth authorization server with the identity provider federated behind it, because Entra supports neither CIMD nor DCR; this makes it the highest-value target, with stated compensations.
status: stable
tags: [auth, oauth, mcp, security]
source: hub M9
generated: { by: human:migrate, at: 2026-09-03T00:00:00Z }
---

The access hub is a full OAuth authorization server with the identity provider federated behind it, because Entra supports neither CIMD nor DCR; this makes it the highest-value target, with stated compensations.

## Why

There was no other option that meets the requirement. The consequence is stated, not left implicit: a
compromise of the access hub mints tokens for any user against any agent.

Compensations:

## Context

Build an authorization server, not a resource server that trusts the identity provider. Entra is federated
behind it for authentication only.

The requirement is "paste one URL into an MCP client, no admin work per client". Entra supports
neither Client ID Metadata Documents nor Dynamic Client Registration, so Entra cannot be the
authorization server for MCP clients.

- opaque tokens that revoke instantly;
- audience binding per resource;
- the ACL re-checked at authorize, on every refresh and on every tool call;
- only allowlisted client hosts may register;
- no long-lived signing keys to steal;
- the audit trail exported to a log store the access hub cannot erase.
