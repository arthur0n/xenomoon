---
name: warehouse-loads-stage-then-merge
kind: verdicts
description: Every warehouse load writes a run-scoped staging table, MERGEs it into the target on the job's merge key with dedup by ordering, then validates; rerunning any file never duplicates rows.
status: accepted
tags: [data-warehouse, etl]
date: 2026-08-18
source: warehouse convention
---

# Stage, then MERGE on the key

## Context

Imports are retried and replayed. Appending rows on every run would duplicate data.

## Decision

Pipeline: archive raw, transform, write NDJSON, load into a staging table with truncate, MERGE into the target on the merge key (dedup by ROW_NUMBER over the order column, newest wins; with a freshness column, a match is updated only by same-or-newer data), validate counts, write a run-log row. A job is defined only by name, table, merge key, order column, optional freshness column and transform. Never append.

## Why

Idempotent by construction: any file can be rerun safely.
