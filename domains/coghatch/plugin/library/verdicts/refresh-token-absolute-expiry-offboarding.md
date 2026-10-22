---
name: refresh-token-absolute-expiry-offboarding
kind: verdicts
description: Refresh tokens carry an absolute expiry of 8 hours, matching the session, and that number is the offboarding window; every refresh also re-checks the ACL so removal is immediate.
status: accepted
tags: [oauth, auth, security]
date: 2026-09-03
source: hub M11
---

# Refresh absolute expiry is 8 hours, the offboarding window

## Context

ASVS 10.4.8 (L2) requires refresh tokens to have an absolute expiration. That value answers "how long does
an offboarded employee keep access?". A disabled identity-provider account cannot complete a new login,
so the exposure is only the tokens already held.

## Decision

- Refresh tokens expire absolutely after 8 hours, the same as the browser session, so there is one number.
- Every code exchange and every refresh re-reads the ACL entry, the recorded consent and the digest of
  the approved client document; the OAuth library re-checks client id, grant liveness and scope.
  Removing an ACL row ends access at the next refresh, not in 8 hours.
- The client-document check is bounded by the CIMD cache (up to 24 h, itself cut by these 8 h), so it is
  not immediate.

## Why

The 8 hours is an upper bound, not the only control. Unverified until the organisation states a session
policy. Later option: derive the ACL from identity-provider group membership via Graph, shrinking the
window to a sync interval; that needs a Graph application permission, not a licence upgrade.
