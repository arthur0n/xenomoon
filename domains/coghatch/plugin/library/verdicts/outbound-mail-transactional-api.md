---
name: outbound-mail-transactional-api
kind: verdicts
description: All outbound mail goes through one transactional mail HTTPS API (Postmark) with domain-level authorisation, one token and zero dependencies; the SMTP route was deleted, not kept as a fallback.
status: accepted
supersedes: [outbound-mail-smtp-submission, agent-own-mailbox-credentials]
tags: [email, secrets, deps]
date: 2026-09-11
source: platform D1
---

# Outbound mail through a transactional API

## Context

SMTP submission needed a mailbox per sending address and a password per mailbox. The platform sends as
several addresses on one domain (each pipeline and each agent).

## Decision

The only sending route is the Postmark HTTPS API, called with plain `fetch` and one server-token header,
behind the existing `Mailer` contract. Authorisation is at the domain (DKIM-aligned DMARC), so any address on
the domain is a From value, not a credential. The SMTP adapter, its config keys, its secrets and its
dependency were deleted. A future vendor is a new adapter behind the same contract, never a kept route.

## Why

- No mailbox per address, one secret for the platform.
- Zero new runtime dependencies (the same shape as other `fetch` adapters).
- "No legacy or backward": a dormant fallback is code nobody tests.
