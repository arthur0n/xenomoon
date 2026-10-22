---
name: idp-guest-accounts-refused
kind: verdicts
description: Guest (B2B) accounts are refused at sign-in using Entra's acct claim, because a guest carries the home tenant's tid and passes a tenant check; an absent claim fails closed.
status: accepted
tags: [auth, security]
date: 2026-09-03
source: hub M12
---

# Guest accounts are refused

## Context

Entra documents `tid` as the tenant the user is signing in to. A B2B guest signing into the
organisation's tenant therefore carries that tenant's `tid` and passes a tenant check. The rule is
"members only", so the tenant check alone is not enough.

## Decision

- Configure the `acct` optional claim on the app registration (`0` = member, `1` = guest).
- Read it after the `oid`, `tid` and token-age checks: numeric or string `0` is a member; `1` is refused as
  `guest`; absent or any other value is refused as `account`. Compare with strict equality, never coerce
  (the JSON type is not documented).
- Every refusal is the same opaque 401 with a fixed log line naming the reason, never a claim value.
- The ACL stays the second gate.

## Why

Absence fails closed because the claim is configured on the registration: a token without it is a
misconfiguration, not a member.
