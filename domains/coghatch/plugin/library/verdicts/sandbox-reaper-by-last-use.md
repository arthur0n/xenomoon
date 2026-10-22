---
name: sandbox-reaper-by-last-use
kind: verdicts
description: Idle sandbox containers are reaped by last use, tracked with in-process leases on every provider operation, not by creation time.
status: amended
tags: [agent-forge, sandbox]
date: 2026-09-24
source: forge A10
---

# Reap idle sandboxes by last use

## Context

The upstream reaper was never called and judged staleness by creation time, so an old but active container could be removed and dead ones stayed forever.

## Decision

Every provider operation (exec, upload, download, copy-out) holds a lease in a process-wide registry. A container is idle when no lease holds it and it has been unused for the cutoff; after a restart unknown containers count as last used at boot. The reaper marks a container before removing it, and an operation on a removed container raises not-available so the core recreates an empty sandbox. Cutoff and interval come from config (both or neither).

## Why

Safe in-process because only one server holds the Docker socket. A database last-use record would need migrations and pays off only with several replicas.
