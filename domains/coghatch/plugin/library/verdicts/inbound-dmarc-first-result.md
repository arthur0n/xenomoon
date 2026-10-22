---
name: inbound-dmarc-first-result
kind: verdicts
description: The Email Worker trusts only the first DMARC result in Authentication-Results, because Cloudflare prepends its own verdict and a sender cannot get ahead of it; per-sender exemptions were rejected.
status: accepted
supersedes: [inbound-dmarc-every-result]
amends: [inbound-mail-cloudflare-email-worker]
tags: [email, security]
date: 2026-09-14
source: platform D19
---

# Trust the first DMARC result

## Context

Requiring every DMARC result to pass broke every Exchange-forwarded mail. The header is returned with all
instances joined, and Cloudflare prepends its own.

## Decision

Read Cloudflare's first method-position DMARC result as the verdict. Position, not the authserv-id, tells the
instances apart (a forger can reuse Cloudflare's authserv-id). Both real headers (forged and Exchange) are test
fixtures. A per-sender DMARC exemption was rejected: it would admit anyone forging that From.

## Why

- The first result is computed on the mail that reached the zone.
- Known limit: the parser does not track RFC 8601 comments; every unexpected variant fails closed.
