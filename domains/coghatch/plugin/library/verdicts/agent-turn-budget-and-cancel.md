---
name: agent-turn-budget-and-cancel
kind: verdicts
description: Each agent has one time budget per question, fixed from the turn's server creation time; the wait polls until terminal or deadline, reads once more, then cancels the turn by id, so no turn runs after its caller stops waiting.
status: amended
amends: [agent-harness-serves-every-agent]
tags: [agent-forge, workflow-engine]
date: 2026-10-09
source: platform D33
---

# One budget per question, then cancel

## Context

Waiting had no single bound; an attempt cut short could leave an agent turn running with nobody waiting.

## Decision

`deadlineAt = turn created_at + TIMEOUT_MS`, fixed in `agent-turn`, identical on every attempt. Bounds: at
least the longest measured successful turn for that agent (measurement written next to the value), at most
the harness's own execution timeout; config refuses larger. The wait polls the turn; an attempt cut short is
retried and polls to the same deadline. At the deadline, read once more (a turn that finished is delivered),
then cancel by turn id under a fresh request timeout and throw a named deadline error. A finished turn maps to
text or a named error (empty, action required, error, cancelled); errors carry the turn id, never agent text.

## Why

- One budget, counted on the server, cannot drift across attempts.
- Cancelling on deadline frees the harness's resources.
