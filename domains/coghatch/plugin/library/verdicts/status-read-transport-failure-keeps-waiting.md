---
name: status-read-transport-failure-keeps-waiting
kind: verdicts
description: A transport failure while reading an agent turn's status does not end the wait; it is logged as a category only and the turn is read again until the deadline, while a malformed status is a named terminal failure.
status: accepted
amends: [agent-turn-budget-and-cancel]
tags: [agent-forge, observability]
date: 2026-10-16
source: platform D33
---

# Transport failures do not end the wait

## Context

A dropped connection on one status read ended a wait for a turn that was still running fine.

## Decision

Transport (no HTTP status: a fetch `TypeError`, the SDK's own timeout, a body cut mid-stream) is logged as a
category only (never message or URL) and the turn is read again after the poll interval, under the same
budget; only the deadline ends the loop, with no consecutive-failure limit (that would be an invented number).
HTTP, auth and parse errors still end the call. A 2xx whose body has no readable status is a named malformed
error with no cause (the body may hold agent text), not a running turn.

## Why

- Re-reading a malformed answer as transport would spend the whole budget and then cancel a turn that may be fine.
