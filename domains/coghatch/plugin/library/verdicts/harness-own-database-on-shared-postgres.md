---
name: harness-own-database-on-shared-postgres
kind: verdicts
description: The agent harness gets its own database on the VM's existing Postgres, so the existing all-databases backup already covers it.
status: amended
tags: [agent-forge, infra, backups]
date: 2026-09-21
source: forge D4
---

# Own database on the shared Postgres

## Context

The harness needs a relational store. The VM already runs Postgres with a nightly dump of every non-template database.

## Decision

Create a separate database for the harness on the existing Postgres instance. No new database server.

## Why

No new service to run, and backups come for free because the dump job covers every database.
