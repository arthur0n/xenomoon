---
name: no-retry-when-outcome-cannot-change
kind: verdicts
description: A retry that cannot change the outcome is not made: terminal agent turn outcomes are returned from the step and turned into a non-retriable error by the wiring, so the failure mail goes out within one budget.
status: accepted
amends: [agent-turn-budget-and-cancel]
tags: [workflow-engine, agent-forge]
date: 2026-10-16
source: platform D33
---

# Do not retry what cannot change

## Context

A retry of the wait step reads the same turn, so a terminal outcome (empty answer, error, cancelled, deadline
with a successful cancel) is thrown again on every one of the engine's default retries, delaying the failure
alert by several budgets.

## Decision

The wait step returns these outcomes as `{ ok: false, reason }`; the pipeline wiring throws
`NonRetriableError(reason)` outside the step, off the memoized value. A deadline whose cancel failed is still
retried, because the turn may still run and the retry cancels again. Transport and HTTP failures are still
retried by default. Recovery stays a rerun from `agent-turn` or earlier.

## Why

- The run fails on its first attempt and the failure mail goes out within one budget, not five.
- A wrapper inside `step.run` is refused by the step rule, so the throw belongs to the wiring.
