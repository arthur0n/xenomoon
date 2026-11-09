---
type: verdicts
title: ETL runs in the warehouse's cloud
description: The ETL runs as container jobs plus a scheduler in the same cloud as the warehouse, so auth is an attached service account and no key is exported to another cloud.
status: stable
tags: [infra, etl, auth]
source: warehouse convention
generated: { by: human:migrate, at: 2026-08-18T00:00:00Z }
---

The ETL runs as container jobs plus a scheduler in the same cloud as the warehouse, so auth is an attached service account and no key is exported to another cloud.

## Why

No exported key files; one console, one bill.

## Context

Container jobs and a cloud scheduler in the warehouse's own cloud, with the service account attached to the job.

The ETL could have run in another cloud where other workloads lived.
