---
name: no-invented-numbers
kind: verdicts
description: Every limit, size, cost, version or timeout is measured, read from a named source, or labelled UNVERIFIED — and lives in config with its reason, never as a bare constant in code.
status: accepted
tags: [convention, config]
date: 2026-09-03
---

# No invented numbers

## Context

Timeouts, retries, byte caps, token lifetimes, machine sizes and alert thresholds kept arriving as "reasonable"
values copied from older documents.

## Decision

Every number that shapes behaviour (timeout, retry count, concurrency, cap, TTL, rate limit, machine size, alert
threshold, version, cost):

- lives in config, not in code;
- has its written reason next to it;
- is traceable to evidence (a measurement, a requirement, a vendor page) or is labelled **UNVERIFIED** until it is.

If the answer to "why that number" is "it seemed reasonable", the number is wrong. A number inherited from a
document of unknown provenance is an invention until re-derived. A version recalled from memory is an invented
number too (see `exact-version-pins`).

## Why

Unsourced limits become load-bearing and nobody can tell later whether changing them is safe.
