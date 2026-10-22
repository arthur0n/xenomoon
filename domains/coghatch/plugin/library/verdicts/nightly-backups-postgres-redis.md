---
name: nightly-backups-postgres-redis
kind: verdicts
description: Back up nightly with pg_dump of every database plus a Redis RDB snapshot, streamed by a systemd timer straight into a bucket the VM can only create objects in; a restore is rehearsed, because a backup never restored is not a backup.
status: amended
tags: [backups, infra, security]
date: 2026-09-19
source: platform D28
---

# Nightly Postgres and Redis backups

## Context

One VM is the single point of failure by design, so recovery is restore-from-backup. The workflow engine keeps
history in Postgres and queue and run state in Redis; no vendor page says Postgres alone restores the server.

## Decision

A systemd timer runs `pg_dump -Fc` of every non-template database plus a Redis RDB snapshot and streams them
(never through a file on disk) to a dedicated bucket: lifecycle delete at 30 days, uniform access, public
access prevented. The VM holds create-only on the bucket and uploads through the GCS JSON API (resumable,
metadata-server token), because `gcloud storage cp` needs read on the destination. The backup unit uses
`Requisite=` so a timer never starts the stack. Restore = `pg_restore` (and optionally the RDB with AOF off
once) on a scratch VM, rehearsed and timed. An alert fires when no object is newer than 36 h.

## Why

- Create-only: a compromised VM can write a backup but not read, overwrite or delete one.
- Rejected: disk snapshots (only crash-consistent, and they carry stale images); Cloud SQL (cost, and it
  re-opens the single-VM decision).
