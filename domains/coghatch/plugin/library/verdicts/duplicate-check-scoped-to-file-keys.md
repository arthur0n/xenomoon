---
type: verdicts
title: Duplicate check scoped to the file's keys
description: Post-load validation checks duplicate merge keys only among the keys the file staged, never table-wide, because a table-wide check reports old duplicates and blocks every later import.
status: stable
tags: [data-warehouse, etl, testing]
source: warehouse convention
generated: { by: human:migrate, at: 2026-08-24T00:00:00Z }
---

Post-load validation checks duplicate merge keys only among the keys the file staged, never table-wide, because a table-wide check reports old duplicates and blocks every later import.

## Why

Validation must judge this load, not the table's history.

## Context

The duplicate-key check covers only the merge keys the current file staged. A test pins the scoped form.

MERGE cannot create a duplicate key. A table-wide duplicate check therefore only found pre-existing duplicates, and a few legacy rows failed every queued file.
