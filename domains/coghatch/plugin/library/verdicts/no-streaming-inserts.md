---
type: verdicts
title: No streaming inserts
description: The warehouse is written only by batch load jobs and DML, never by streaming inserts, which are billable; the client type does not even expose a streaming method.
status: stable
tags: [data-warehouse, cost]
source: warehouse convention
generated: { by: human:migrate, at: 2026-08-18T00:00:00Z }
---

The warehouse is written only by batch load jobs and DML, never by streaming inserts, which are billable; the client type does not even expose a streaming method.

## Why

Zero load cost, enforced by the type, not by memory.

## Context

Load jobs and DML only. The warehouse client wrapper exposes no streaming-insert method, so one cannot be written against it.

Batch loads are free in BigQuery; streaming inserts are charged.
