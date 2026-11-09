---
type: verdicts
title: Technical inbound address, not a mailbox
description: Email-triggered automations receive mail at a technical inbound address the platform receives itself, never a real mailbox, so pipelines need no mail permissions or per-user consent.
status: stable
tags: [email, auth]
source: platform D1
generated: { by: human:migrate, at: 2026-09-03T00:00:00Z }
---

Email-triggered automations receive mail at a technical inbound address the platform receives itself, never a real mailbox, so pipelines need no mail permissions or per-user consent.

## Why

- No mailbox means no mail-read permission and no consent flow inside the pipelines.
- The same pattern the previous automation vendor used for its trigger address.

## Context

Use a technical inbound email address. Employees forward to it; the platform receives the mail itself.
The domain is chosen separately and is configuration.

Employees trigger automations by forwarding mail. A real mailbox (for example in Microsoft 365) would need
mail API permissions and per-user consent wired into every pipeline.
