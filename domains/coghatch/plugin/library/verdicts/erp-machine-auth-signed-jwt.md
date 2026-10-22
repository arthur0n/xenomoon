---
name: erp-machine-auth-signed-jwt
kind: verdicts
description: Pipelines sign in to the ERP with OAuth 2.0 client credentials using a short-lived JWT signed by a private key held only in the secret store; no shared secret on the wire, no key file, no user login.
status: accepted
tags: [auth, oauth, connections, secrets]
date: 2026-09-19
source: warehouse netsuite-auth
---

# ERP machine auth with a signed JWT

## Context

Every ERP pipeline needs unattended access.

## Decision

Sign a JWT (EC P-256, raw signature encoding, mandatory issued-at, expiry under one hour) with a key from the secret store, exchange it for a bearer token, refresh before expiry, one token per run. The private key reaches only the sign call and is never logged.

## Why

No reusable secret travels, and nothing sits on disk.
