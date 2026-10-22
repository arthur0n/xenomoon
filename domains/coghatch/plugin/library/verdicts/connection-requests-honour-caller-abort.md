---
name: connection-requests-honour-caller-abort
kind: verdicts
description: Every connections request accepts an optional caller AbortSignal; an abort ends the call with no further attempt and is reported as its own non-retryable outcome, never a timeout.
status: accepted
amends: [connection-layer-in-process]
tags: [connections]
date: 2026-10-08
source: platform D25
---

# A caller that stops waiting cancels the call

## Context

Callers with their own deadlines kept waiting on requests (and retries) they no longer needed.

## Decision

Each request accepts an optional caller `AbortSignal`, forwarded to the request and to any token request made
for it, combined with the per-attempt timeout. An abort ends the call: no further attempt, the retry wait is
cut short, an already-aborted signal sends nothing. It is reported as kind `aborted`, `retryable: false`,
carrying the signal's reason. No signal means unchanged behaviour.

## Why

- Work nobody waits for is wasted load and can still have side effects.
- Distinct from a timeout so callers never retry an abort.
