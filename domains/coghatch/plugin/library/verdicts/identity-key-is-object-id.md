---
type: verdicts
title: Identity key = the IdP object id, never email
description: The identity key everywhere (ACLs, sessions, logs) is the identity provider's immutable object id, never an email; email and name are display-only and never logged.
status: stable
tags: [convention, auth, security]
generated: { by: human:migrate, at: 2026-09-03T00:00:00Z }
---

The identity key everywhere (ACLs, sessions, logs) is the identity provider's immutable object id, never an email; email and name are display-only and never logged.

## Why

Emails change and are reused; an object id does not, and keeping it out of logs keeps PII out of logs.

## Context

- ACL documents, sessions and logs key a person by the identity provider's immutable object id (Entra `oid`).
- Email and display name are for display only: never a lookup key, never in a log line (no PII in logs).
- One allowed bridge: a grant made before a person's first sign-in may be stored as pending-by-email; the first
  sign-in resolves it into the object-id record and deletes the pending one.
- No identity header is forwarded upstream from client input; inbound headers in that namespace are dropped.
