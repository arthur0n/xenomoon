---
type: verdicts
title: ERP machine auth with a signed JWT
description: Pipelines sign in to the ERP with OAuth 2.0 client credentials using a short-lived JWT signed by a private key held only in the secret store; no shared secret on the wire, no key file, no user login.
status: stable
tags: [auth, oauth, connections, secrets]
source: warehouse netsuite-auth
generated: { by: human:migrate, at: 2026-09-19T00:00:00Z }
---

Pipelines sign in to the ERP with OAuth 2.0 client credentials using a short-lived JWT signed by a private key held only in the secret store; no shared secret on the wire, no key file, no user login.

## Why

No reusable secret travels, and nothing sits on disk.

## Context

Sign a JWT (EC P-256, raw signature encoding, mandatory issued-at, expiry under one hour) with a key from the secret store, exchange it for a bearer token, refresh before expiry, one token per run. The private key reaches only the sign call and is never logged.

Every ERP pipeline needs unattended access.
