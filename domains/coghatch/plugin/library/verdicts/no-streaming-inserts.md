---
name: no-streaming-inserts
kind: verdicts
description: The warehouse is written only by batch load jobs and DML, never by streaming inserts, which are billable; the client type does not even expose a streaming method.
status: accepted
tags: [data-warehouse, cost]
date: 2026-08-18
source: warehouse convention
---

# No streaming inserts

## Context

Batch loads are free in BigQuery; streaming inserts are charged.

## Decision

Load jobs and DML only. The warehouse client wrapper exposes no streaming-insert method, so one cannot be written against it.

## Why

Zero load cost, enforced by the type, not by memory.
