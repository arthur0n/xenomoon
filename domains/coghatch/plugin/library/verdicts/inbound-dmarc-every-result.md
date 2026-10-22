---
name: inbound-dmarc-every-result
kind: verdicts
description: The Email Worker first required every DMARC result in Authentication-Results to be pass, because Cloudflare does not strip a sender's forged Authentication-Results header.
status: superseded
tags: [email, security]
date: 2026-09-08
source: platform D19
---

# Require every DMARC result to pass (replaced)

## Context

A forged-header test showed Cloudflare does not strip a sender's own `Authentication-Results` header, so a
forger could add `dmarc=pass` by hand.

## Decision

The Worker required every method-position DMARC result in the joined header to be `pass`.

## Why

- It rejected the forged mail.
- It also rejected every mail forwarded through Exchange, which appends its own `dmarc=none` verdict on the
  unsigned internal copy. Replaced by the first-result rule.
