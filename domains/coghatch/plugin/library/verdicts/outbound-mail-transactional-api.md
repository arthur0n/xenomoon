---
type: verdicts
title: Outbound mail through a transactional API
description: All outbound mail goes through one transactional mail HTTPS API (Postmark) with domain-level authorisation, one token and zero dependencies; the SMTP route was deleted, not kept as a fallback.
status: stable
supersedes: [outbound-mail-smtp-submission, agent-own-mailbox-credentials]
tags: [email, secrets, deps]
source: platform D1
generated: { by: human:migrate, at: 2026-09-11T00:00:00Z }
---

All outbound mail goes through one transactional mail HTTPS API (Postmark) with domain-level authorisation, one token and zero dependencies; the SMTP route was deleted, not kept as a fallback.

## Why

- No mailbox per address, one secret for the platform.
- Zero new runtime dependencies (the same shape as other `fetch` adapters).
- "No legacy or backward": a dormant fallback is code nobody tests.

## Context

The only sending route is the Postmark HTTPS API, called with plain `fetch` and one server-token header,
behind the existing `Mailer` contract. Authorisation is at the domain (DKIM-aligned DMARC), so any address on
the domain is a From value, not a credential. The SMTP adapter, its config keys, its secrets and its
dependency were deleted. A future vendor is a new adapter behind the same contract, never a kept route.

SMTP submission needed a mailbox per sending address and a password per mailbox. The platform sends as
several addresses on one domain (each pipeline and each agent).
