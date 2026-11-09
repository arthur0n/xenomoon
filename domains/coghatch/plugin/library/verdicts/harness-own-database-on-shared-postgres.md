---
type: verdicts
title: Own database on the shared Postgres
description: The agent harness gets its own database on the VM's existing Postgres, so the existing all-databases backup already covers it.
status: stable
tags: [agent-forge, infra, backups]
source: forge D4
generated: { by: human:migrate, at: 2026-09-21T00:00:00Z }
---

The agent harness gets its own database on the VM's existing Postgres, so the existing all-databases backup already covers it.

## Why

No new service to run, and backups come for free because the dump job covers every database.

## Context

Create a separate database for the harness on the existing Postgres instance. No new database server.

The harness needs a relational store. The VM already runs Postgres with a nightly dump of every non-template database.
