---
name: failure-alerts-to-sender-and-ops
kind: verdicts
description: Failure alerts were first sent to both the forwarding employee and an ops address, since the forwarder can fix the input and ops needs the pattern.
status: superseded
tags: [observability, email]
date: 2026-09-03
source: platform D2
---

# Failure alerts to sender and ops (replaced)

## Context

A failed pipeline run must reach someone who can act on it.

## Decision

Send failure alerts to both the employee who forwarded the mail and a configured ops address.

## Why

- The forwarder can fix the input; ops sees the pattern. Neither alone closes the loop.
- Replaced by one shared failure handler mailing ops only (see the superseding record).
