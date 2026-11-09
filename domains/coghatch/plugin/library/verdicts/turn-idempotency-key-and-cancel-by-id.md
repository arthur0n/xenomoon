---
type: verdicts
title: Idempotent turns, resume, cancel by id
description: A turn is created once per question under a caller-chosen key the server makes idempotent; a caller that outlives its wait resumes that turn, and a caller that gives up cancels it by turn id.
status: stable
tags: [agent-forge, workflow-engine]
source: forge A45
generated: { by: human:migrate, at: 2026-10-08T00:00:00Z }
---

A turn is created once per question under a caller-chosen key the server makes idempotent; a caller that outlives its wait resumes that turn, and a caller that gives up cancels it by turn id.

## Why

Only the caller knows which turn it waits on; retries must not multiply model work.

## Context

The caller sends its own key when it creates a turn; the server returns the existing turn for a repeated key. A caller past its deadline resumes waiting on that turn, never recreates it. A caller that gives up cancels with the turn id: the turn must belong to the session (else 404) and is cancelled only while running. Without a turn id the upstream behaviour stays. A cancel body that is not JSON is refused and cancels nothing.

Workflow steps retry. A retried step that creates a new turn duplicates work, and a cancel without a turn id cancels whatever ran last, possibly another caller's turn.
