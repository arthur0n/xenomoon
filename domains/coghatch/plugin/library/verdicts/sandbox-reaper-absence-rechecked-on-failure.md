---
type: verdicts
title: Re-check a sandbox's absence on failure
description: A sandbox is declared gone only when a failed operation is followed by an exact-name container listing that confirms it is absent; creation holds a lease so a sweep cannot remove a container being built.
status: stable
amends: [sandbox-reaper-by-last-use]
tags: [agent-forge, sandbox]
source: forge A12
generated: { by: human:migrate, at: 2026-09-24T00:00:00Z }
---

A sandbox is declared gone only when a failed operation is followed by an exact-name container listing that confirms it is absent; creation holds a lease so a sweep cannot remove a container being built.

## Why

A user command can print 'No such container'. Only a positive check of the daemon is evidence.

## Context

When an exec fails or an upload or download fails, list the container by exact name. Raise not-available only if the listing succeeds and the name is absent; otherwise return the user's result unchanged. The container name is leased from before creation through init and cleanup. Absence is never inferred from command output.

Checking presence once per container left a session broken after any removal outside the reaper. Inspect cannot tell a missing container from an unreachable daemon.
