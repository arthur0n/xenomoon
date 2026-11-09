---
type: verdicts
title: One writer per table at a time
description: MERGE by key relies on one writer per table at a time — loads are serialised within a sweep, sweeps never overlap by schedule and timeout, and there is no automatic dedupe; a duplicate means the invariant broke and the load fails loud.
status: stable
tags: [data-warehouse, etl, workflow-engine]
source: warehouse convention
generated: { by: human:migrate, at: 2026-09-13T00:00:00Z }
---

MERGE by key relies on one writer per table at a time — loads are serialised within a sweep, sweeps never overlap by schedule and timeout, and there is no automatic dedupe; a duplicate means the invariant broke and the load fails loud.

## Why

The guarantee is structural, and a broken invariant shows up as a failure, not as silent dedupe.

## Context

A load run takes up to a configured number of files from one pipeline's queue in file order, one run-log row per file, serialised in code. Across runs nothing overlaps: no manual executions, the drain is capped inside the worker timeout, and schedules are further apart than that timeout. Queue settings or task spacing are not relied on, since they bound only when runs start.

One load run drains several files. Concurrent writers to one table could race the MERGE.
