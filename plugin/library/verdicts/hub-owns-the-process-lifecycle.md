---
type: verdicts
title: hub-owns-the-process-lifecycle
description: Opening a tab starts the project's server detached through the install's own `start_server`; closing a tab leaves it running; stop is an explicit button; orphan servers are shown, not adopted.
status: draft
tags: [hub, architecture, process]
generated: { by: human:arthur0n, at: 2026-11-09T13:45:55.971Z }
---

Opening a tab starts the project's server detached through the install's own `start_server`; closing a tab leaves it running; stop is an explicit button; orphan servers are shown, not adopted.

## Why

Restarts are the common failure: 37 of 59 harvested sessions were boot-only, with bursts of 4 boots in 39 seconds, so the lifecycle needs one owner.
Reusing `start_server` and `stop_server` keeps one way to start and stop a server.
A closed tab is a view, not a kill.

## Context

#63; start_server, stop_server and ui/server/cli/orphan-servers.js in #59 Facts §2.
Open in #63: the PID file after a UI restart that respawns detached.

## Rejected

The hub spawns servers with PID files of its own.
Closing a tab stops the server.

## Consequences

A boot must not replay stale autonomous state: a goal from weeks before was replayed on every boot.
