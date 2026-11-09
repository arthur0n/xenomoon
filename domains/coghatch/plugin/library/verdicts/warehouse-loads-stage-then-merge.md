---
type: verdicts
title: Stage, then MERGE on the key
description: Every warehouse load writes a run-scoped staging table, MERGEs it into the target on the job's merge key with dedup by ordering, then validates; rerunning any file never duplicates rows.
status: stable
tags: [data-warehouse, etl]
source: warehouse convention
generated: { by: human:migrate, at: 2026-08-18T00:00:00Z }
---

Every warehouse load writes a run-scoped staging table, MERGEs it into the target on the job's merge key with dedup by ordering, then validates; rerunning any file never duplicates rows.

## Why

Idempotent by construction: any file can be rerun safely.

## Context

Pipeline: archive raw, transform, write NDJSON, load into a staging table with truncate, MERGE into the target on the merge key (dedup by ROW_NUMBER over the order column, newest wins; with a freshness column, a match is updated only by same-or-newer data), validate counts, write a run-log row. A job is defined only by name, table, merge key, order column, optional freshness column and transform. Never append.

Imports are retried and replayed. Appending rows on every run would duplicate data.
