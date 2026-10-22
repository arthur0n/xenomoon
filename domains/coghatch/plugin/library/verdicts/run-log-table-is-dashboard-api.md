---
name: run-log-table-is-dashboard-api
kind: verdicts
description: Every ETL run writes one row to a run-log table and updates it at the end; dashboards read only this table, and within a version it changes only by added columns or keys.
status: accepted
tags: [data-warehouse, observability, etl]
date: 2026-08-26
source: warehouse run-log
---

# Run-log table is the dashboard API

## Context

Dashboards reading pipeline tables directly would break on every pipeline change.

## Decision

Each run writes running, then success or failed, with stage, counts, provenance and error, via DML. Dashboards read only this table. Additive changes only within a version; renames or removals are a new version with a dashboard migration. Tests pin the SQL byte for byte. Nullable query parameters always carry an explicit type.

## Why

One stable contract between pipelines and anything that watches them.
