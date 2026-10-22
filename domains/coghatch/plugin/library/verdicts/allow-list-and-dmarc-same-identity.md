---
name: allow-list-and-dmarc-same-identity
kind: verdicts
description: An inbound mail is accepted only when the sender allow-list and DMARC name the same identity: the DMARC header.from domain must equal the domain of the single parsed From address.
status: accepted
amends: [inbound-mail-cloudflare-email-worker]
tags: [email, security]
date: 2026-09-15
source: platform D19
---

# Allow-list and DMARC name one identity

## Context

A crafted From header put an allowed address inside a comment, while DMARC authenticated the attacker's own
domain. The allow-list matched the comment and the Worker forwarded the mail.

## Decision

The From header is parsed per RFC 5322 with comments treated as comments. The trusted DMARC result's
`header.from=` domain must equal the domain of that single From address; a result with no `header.from=` is
refused.

## Why

- Two checks on two different identities are no check at all.
- Found by an adversarial code review and reproduced before the fix.
