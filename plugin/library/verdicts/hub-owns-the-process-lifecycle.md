---
type: verdicts
title: hub-owns-the-process-lifecycle
description: A client's server starts only on an explicit hub action, detached through the install's own `start_server` with the row's port; stop is explicit too; closing the hub leaves every client's server running; orphan servers are shown, not adopted.
status: stable
tags: [hub, architecture, process]
generated: { by: human:arthur0n, at: 2026-11-09T13:45:55.971Z }
---

A client's server starts only on an explicit hub action, detached through the install's own `start_server` with the row's port; stop is explicit too; closing the hub leaves every client's server running; orphan servers are shown, not adopted.

## Why

Restarts are the common failure: 37 of 59 harvested sessions were boot-only, with bursts of 4 boots in 39 seconds, so the lifecycle needs one owner.
Reusing `start_server` and `stop_server` keeps one way to start and stop a server.
Owner, 2026-11-10: "imagine I have 10 clients, but I'm only actively working in one or two, why I'll keep like 8 open?"; a client he is not in costs nothing, and closing the hub is not a kill.

## Context

#63; start_server, stop_server and ui/server/cli/orphan-servers.js in #59 Facts §2.
The pid file and log are per port (server-port.sh), and stop_server trusts a recorded pid only when it is this install's server and listens on that port; otherwise the port scan finds the server by ownership (#63).

## Rejected

The hub spawns servers with PID files of its own.
Closing the hub stops the running servers. Owner, 2026-11-10, chose the other reading: the next hub start finds them by their ports ("6 first option").

- Starting every client's server when the hub starts. Owner, 2026-11-10: "imagine I have 10 clients, but I'm only actively working in one or two, why I'll keep like 8 open?" and "How can we switch back, switch off, switch on?"

## Consequences

A boot must not replay stale autonomous state: a goal from weeks before was replayed on every boot.

- Start and stop go through the install's own start_server and stop_server with the row's PORT; the pid file and log are per port (.xm-run/ui.<port>.pid, .log). The hub refuses to start into a port that is held by another project or whose state is unknown, and refuses to stop a server whose path is not the row's. Closing the hub leaves every client's server running; the next hub start finds it by its port (owner, 2026-11-10: first option of line 6, confirmed "yes to all, 6 first option").
