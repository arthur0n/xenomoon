---
name: identity-key-is-object-id
kind: verdicts
description: The identity key everywhere (ACLs, sessions, logs) is the identity provider's immutable object id, never an email; email and name are display-only and never logged.
status: accepted
tags: [convention, auth, security]
date: 2026-09-03
---

# Identity key = the IdP object id, never email

## Decision

- ACL documents, sessions and logs key a person by the identity provider's immutable object id (Entra `oid`).
- Email and display name are for display only: never a lookup key, never in a log line (no PII in logs).
- One allowed bridge: a grant made before a person's first sign-in may be stored as pending-by-email; the first
  sign-in resolves it into the object-id record and deletes the pending one.
- No identity header is forwarded upstream from client input; inbound headers in that namespace are dropped.

## Why

Emails change and are reused; an object id does not, and keeping it out of logs keeps PII out of logs.
