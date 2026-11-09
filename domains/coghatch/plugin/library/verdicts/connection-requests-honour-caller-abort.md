---
type: verdicts
title: A caller that stops waiting cancels the call
description: Every connections request accepts an optional caller AbortSignal; an abort ends the call with no further attempt and is reported as its own non-retryable outcome, never a timeout.
status: stable
amends: [connection-layer-in-process]
tags: [connections]
source: platform D25
generated: { by: human:migrate, at: 2026-10-08T00:00:00Z }
---

Every connections request accepts an optional caller AbortSignal; an abort ends the call with no further attempt and is reported as its own non-retryable outcome, never a timeout.

## Why

- Work nobody waits for is wasted load and can still have side effects.
- Distinct from a timeout so callers never retry an abort.

## Context

Each request accepts an optional caller `AbortSignal`, forwarded to the request and to any token request made
for it, combined with the per-attempt timeout. An abort ends the call: no further attempt, the retry wait is
cut short, an already-aborted signal sends nothing. It is reported as kind `aborted`, `retryable: false`,
carrying the signal's reason. No signal means unchanged behaviour.

Callers with their own deadlines kept waiting on requests (and retries) they no longer needed.
