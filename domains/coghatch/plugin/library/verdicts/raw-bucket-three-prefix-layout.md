---
type: verdicts
title: Raw bucket: incoming, raw, transformed
description: Each client's raw bucket has three prefixes — incoming (the queue), raw (immutable archive and replay source) and transformed (load-ready, deterministic paths), with a 90-day move to cold storage.
status: stable
tags: [data-warehouse, storage, etl]
source: warehouse convention
generated: { by: human:migrate, at: 2026-08-24T00:00:00Z }
---

Each client's raw bucket has three prefixes — incoming (the queue), raw (immutable archive and replay source) and transformed (load-ready, deterministic paths), with a 90-day move to cold storage.

## Why

Any day can be replayed from raw without re-extracting from the source system.

## Context

One bucket per client. incoming/<job>/<file> is the queue; dropping a file there gets it processed. raw/<job>/<file> is the untouched archive, never deleted or overwritten. transformed/<job>/<file>.ndjson is load-ready and overwritten on rerun. Lifecycle: 90 days to cold storage.

Imports need a queue, a replay source and a staging area, and the first dated-path layout did not separate them.
