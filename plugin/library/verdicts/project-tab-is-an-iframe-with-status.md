---
type: verdicts
title: project-tab-is-an-iframe-with-status
description: A hub tab is the project's own UI in an iframe on the project's port, kept alive when hidden; its status dot comes from `GET /api/status` polled, pushed early by `postMessage`.
status: draft
tags: [hub, architecture, ui]
generated: { by: human:arthur0n, at: 2026-11-09T13:45:55.930Z }
---

A hub tab is the project's own UI in an iframe on the project's port, kept alive when hidden; its status dot comes from `GET /api/status` polled, pushed early by `postMessage`.

## Why

The existing UI keeps working unchanged inside a frame; the hub adds nothing to it.
localhost origins on different ports are same-site, so storage and the WebSocket keep working (#59 external facts).
A cheap read-only status poll is enough for a dot; `postMessage` only makes it faster.

## Context

#60 status endpoint, #61 iframe fixes, #64 hub page.
Harvest 2026-11-09: after every reconnect the human asked for state ("recap", "status?", "what is pending") in 6 sessions.

## Rejected

One single-page app rebuilt over several servers.
A hub-side WebSocket fan-in of every session.

## Consequences

Project servers send `frame-ancestors` for the hub only and `Access-Control-Allow-Origin` on status; the ws URL is built from the frame's own origin.
