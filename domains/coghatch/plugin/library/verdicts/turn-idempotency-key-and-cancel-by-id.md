---
name: turn-idempotency-key-and-cancel-by-id
kind: verdicts
description: A turn is created once per question under a caller-chosen key the server makes idempotent; a caller that outlives its wait resumes that turn, and a caller that gives up cancels it by turn id.
status: accepted
tags: [agent-forge, workflow-engine]
date: 2026-10-08
source: forge A45
---

# Idempotent turns, resume, cancel by id

## Context

Workflow steps retry. A retried step that creates a new turn duplicates work, and a cancel without a turn id cancels whatever ran last, possibly another caller's turn.

## Decision

The caller sends its own key when it creates a turn; the server returns the existing turn for a repeated key. A caller past its deadline resumes waiting on that turn, never recreates it. A caller that gives up cancels with the turn id: the turn must belong to the session (else 404) and is cancelled only while running. Without a turn id the upstream behaviour stays. A cancel body that is not JSON is refused and cancels nothing.

## Why

Only the caller knows which turn it waits on; retries must not multiply model work.
