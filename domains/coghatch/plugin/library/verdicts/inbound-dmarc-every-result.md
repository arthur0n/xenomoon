---
type: verdicts
title: Require every DMARC result to pass (replaced)
description: The Email Worker first required every DMARC result in Authentication-Results to be pass, because Cloudflare does not strip a sender's forged Authentication-Results header.
status: deprecated
tags: [email, security]
source: platform D19
generated: { by: human:migrate, at: 2026-09-08T00:00:00Z }
---

The Email Worker first required every DMARC result in Authentication-Results to be pass, because Cloudflare does not strip a sender's forged Authentication-Results header.

## Why

- It rejected the forged mail.
- It also rejected every mail forwarded through Exchange, which appends its own `dmarc=none` verdict on the
  unsigned internal copy. Replaced by the first-result rule.

## Context

The Worker required every method-position DMARC result in the joined header to be `pass`.

A forged-header test showed Cloudflare does not strip a sender's own `Authentication-Results` header, so a
forger could add `dmarc=pass` by hand.
