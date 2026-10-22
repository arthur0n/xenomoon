---
name: session-absolute-eight-hours
kind: verdicts
description: Browser sessions at the access hub last 8 hours absolute with no sliding renewal, one working day, because expiry is just a silent redirect through the identity provider.
status: accepted
tags: [auth, security]
date: 2026-08-30
source: hub D3
---

# Session: 8 hours absolute, no sliding renewal

## Context

The access hub issues its own session cookie after OIDC sign-in. A session length had to be chosen before
the organisation stated any session policy.

## Decision

Sessions last 8 hours from sign-in, with no sliding renewal. Marked unverified until the organisation
states a policy.

## Why

8 hours is one working day. When it expires the user is sent through the identity provider again, which
is silent while their provider session is alive, so a short fixed window costs almost nothing. The same 8
hours later became the refresh-token absolute expiry (`refresh-token-absolute-expiry-offboarding`), so
there is one number to reason about.
