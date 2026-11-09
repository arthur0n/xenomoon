---
type: verdicts
title: Identity assurance from the identity provider is additive
description: Conditional Access in Entra decides who reaches consent, and the access hub records amr and auth_time into each grant; this is additive assurance, not a gate, and needs no new redirect URIs at the identity provider.
status: stable
tags: [auth, oauth, security]
source: hub M8
generated: { by: human:migrate, at: 2026-09-03T00:00:00Z }
---

Conditional Access in Entra decides who reaches consent, and the access hub records amr and auth_time into each grant; this is additive assurance, not a gate, and needs no new redirect URIs at the identity provider.

## Why

The core OAuth work then has no IT dependency and can be built while the claims request is open.

Unverified: whether Entra emits usable `amr` values for the tenant's real sign-in methods; the portal's
optional-claim picker did not offer `amr`. Confirm against a real token.

## Context

- Conditional Access in Entra (MFA, phishing-resistant methods, device compliance, location, risk)
  decides who reaches consent.
- The access hub captures `amr` and `auth_time` at sign-in and binds them into the grant, so a token
  carries the assurance level of the login that produced it.
- The only identity-provider change is optional claims (`amr`, `auth_time`, `acrs`, `xms_cc`) plus any
  Conditional Access policy. No MCP redirect URIs and no Application ID URI: MCP clients redirect to the
  access hub, which validates them through CIMD; Entra only sees the access hub's own callback.

The access hub is its own authorization server, with Entra federated behind it for sign-in only. An
earlier assumption said IT must add MCP redirect URIs and an Application ID URI to the Entra app.
