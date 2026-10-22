---
name: harness-database-own-user-one-shot-init
kind: verdicts
description: The harness database gets a second Postgres user created by a compose one-shot, the server migrates itself on boot, and every long-running service is capped and bound to localhost.
status: accepted
amends: [harness-own-database-on-shared-postgres]
tags: [agent-forge, infra]
date: 2026-09-21
source: forge A4
---

# Separate database user, one-shot init, migrate on boot

## Context

The VM boot script runs before compose starts, so it cannot create a database that compose services need.

## Decision

A compose one-shot service creates the harness database and its own Postgres user. The server runs its migrations at start, so there is no migrate one-shot. The server binds to 127.0.0.1, carries cost labels and CPU, memory and process caps.

## Why

A separate user limits what the harness can touch in the shared Postgres. Migrating on boot keeps schema and image in step.
