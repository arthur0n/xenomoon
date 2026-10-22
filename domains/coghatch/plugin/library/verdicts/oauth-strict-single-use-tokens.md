---
name: oauth-strict-single-use-tokens
kind: verdicts
description: Each consumable OAuth token (code, refresh token) is claimed by one serialisable transaction; the loser is a replay and its whole grant family is revoked, with no reuse grace window.
status: accepted
tags: [oauth, security]
date: 2026-09-15
source: hub M18
---

# Strict single-use tokens, the loser's family dies

## Context

Clients sometimes refresh in parallel. The library's consume step had no atomic claim, so two concurrent
redemptions of one code or refresh token could both succeed. RFC 9700 4.14.2 requires replay detection
for public clients.

## Decision

- A consumable token is claimed in one Firestore transaction: write `consumedAt` only if unset. Exactly one
  claim commits.
- The loser is a replay: mark the Grant revoked (a tombstone, not a delete) first, then sweep every
  grant-bearing token type by grant id, unconditionally (stricter than the library's own sweep, which
  skips grant types the client no longer allows). Answer `400 invalid_grant`.
- Saving any grant-bearing token first reads the Grant in the same transaction and refuses if it is gone.
  Mark-then-sweep plus guarded save leaves no window for an unguarded write.
- A failed delete mid-sweep surfaces as a 500; leftovers cannot be renewed because the Grant is gone, and
  only an already-issued access token survives, until its 300 s TTL.

## Why

No reuse-tolerance window: a parallel refresh is the replay the RFC asks to detect. Known outcome: both
parallel requests can fail and the session ends; that is intended, not a defect.
