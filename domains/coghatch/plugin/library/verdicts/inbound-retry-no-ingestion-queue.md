---
name: inbound-retry-no-ingestion-queue
kind: verdicts
description: No ingestion queue in front of the receiver: the Email Worker buffers the mail once and retries the receiver on network errors, 429 and 5xx with backoff before rejecting, because the workflow engine is already a durable queue.
status: accepted
amends: [inbound-mail-cloudflare-email-worker]
tags: [email, infra, network]
date: 2026-09-14
source: platform D23
---

# Retry the receiver; no ingestion queue

## Context

Bursts of over 100 mails were expected. The Worker's only rejection is permanent, so any receiver failure
(cold-start 429, outage, signing error) bounced the mail for good. The "sender retries later" backstop did not
exist.

## Decision

The Worker refuses an oversize message before buffering, reads the raw message once, and re-POSTs the same
bytes on a retriable outcome only (network error, 429, 5xx), with backoff `base`, `base × 2`; every other 4xx
rejects at once. Attempts and base delay are Worker vars with their reasons (3, 2000 ms), refused when the
longest wait exceeds the receiver's request timeout. Redirects are not followed, so the bearer never leaves.
Receiver memory goes to 1 GiB. Runs stay one at a time.

## Why

- Stage 2 is already a durable queue; stage 1 has no state to persist.
- Cloudflare Queues cap messages at 128 KB against a 5 MiB mail and would add two products.
- An alert on receiver non-2xx and Worker rejections re-opens the decision.
