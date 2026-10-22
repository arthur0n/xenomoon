---
name: etl-runs-in-warehouse-cloud
kind: verdicts
description: The ETL runs as container jobs plus a scheduler in the same cloud as the warehouse, so auth is an attached service account and no key is exported to another cloud.
status: accepted
tags: [infra, etl, auth]
date: 2026-08-18
source: warehouse convention
---

# ETL runs in the warehouse's cloud

## Context

The ETL could have run in another cloud where other workloads lived.

## Decision

Container jobs and a cloud scheduler in the warehouse's own cloud, with the service account attached to the job.

## Why

No exported key files; one console, one bill.
