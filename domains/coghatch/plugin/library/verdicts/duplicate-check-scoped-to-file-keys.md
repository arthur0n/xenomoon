---
name: duplicate-check-scoped-to-file-keys
kind: verdicts
description: Post-load validation checks duplicate merge keys only among the keys the file staged, never table-wide, because a table-wide check reports old duplicates and blocks every later import.
status: accepted
tags: [data-warehouse, etl, testing]
date: 2026-08-24
source: warehouse convention
---

# Duplicate check scoped to the file's keys

## Context

MERGE cannot create a duplicate key. A table-wide duplicate check therefore only found pre-existing duplicates, and a few legacy rows failed every queued file.

## Decision

The duplicate-key check covers only the merge keys the current file staged. A test pins the scoped form.

## Why

Validation must judge this load, not the table's history.
