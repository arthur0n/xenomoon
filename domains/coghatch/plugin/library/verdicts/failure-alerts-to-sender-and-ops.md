---
type: verdicts
title: Failure alerts to sender and ops (replaced)
description: Failure alerts were first sent to both the forwarding employee and an ops address, since the forwarder can fix the input and ops needs the pattern.
status: deprecated
tags: [observability, email]
source: platform D2
generated: { by: human:migrate, at: 2026-09-03T00:00:00Z }
---

Failure alerts were first sent to both the forwarding employee and an ops address, since the forwarder can fix the input and ops needs the pattern.

## Why

- The forwarder can fix the input; ops sees the pattern. Neither alone closes the loop.
- Replaced by one shared failure handler mailing ops only (see the superseding record).

## Context

Send failure alerts to both the employee who forwarded the mail and a configured ops address.

A failed pipeline run must reach someone who can act on it.
