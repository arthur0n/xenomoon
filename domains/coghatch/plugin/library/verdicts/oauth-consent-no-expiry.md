---
name: oauth-consent-no-expiry
kind: verdicts
description: A recorded OAuth consent does not expire and stands until revoked, but only while the client host is allowlisted and the client still publishes exactly what the user approved.
status: accepted
tags: [oauth, mcp, security]
date: 2026-09-04
source: hub M13
---

# Recorded consent stands until revoked

## Context

ASVS 5.0 V10 was read in full: its consent items (10.7.1-10.7.3, all L2) say nothing about expiry or
re-consent, and neither do OAuth 2.1, RFC 9700 or the MCP spec. But 10.7.1 says that if the client's
identity cannot be assured, the server must always prompt.

## Decision

- A user who approved a client for a resource is not asked again, and the consent record has no TTL.
- The consent stores a digest of exactly the client name and redirect URIs the screen showed. It counts
  only while that digest equals what the client publishes now; a mismatch shows the screen again.
- The consent page states three lifetimes: access token (300 s), refresh expiry (8 h), consent (until
  revoked).

## Why

- Expiry would re-prompt users whose situation has not changed, training them to click through consent.
- The remembered consent is valid only because client identity is assured: CIMD fetched safely from an
  allowlisted host (`cimd-client-host-allowlist`) plus the digest. Widening the allowlist or dropping the
  digest check reopens this decision; consent must then prompt every time.
- A periodic re-consent interval (a month was floated) stays an open option.
