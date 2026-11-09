---
type: verdicts
title: Session: 8 hours absolute, no sliding renewal
description: Browser sessions at the access hub last 8 hours absolute with no sliding renewal, one working day, because expiry is just a silent redirect through the identity provider.
status: stable
tags: [auth, security]
source: hub D3
generated: { by: human:migrate, at: 2026-08-30T00:00:00Z }
---

Browser sessions at the access hub last 8 hours absolute with no sliding renewal, one working day, because expiry is just a silent redirect through the identity provider.

## Why

8 hours is one working day. When it expires the user is sent through the identity provider again, which
is silent while their provider session is alive, so a short fixed window costs almost nothing. The same 8
hours later became the refresh-token absolute expiry (`refresh-token-absolute-expiry-offboarding`), so

## Context

Sessions last 8 hours from sign-in, with no sliding renewal. Marked unverified until the organisation
states a policy.

The access hub issues its own session cookie after OIDC sign-in. A session length had to be chosen before
the organisation stated any session policy.
there is one number to reason about.
