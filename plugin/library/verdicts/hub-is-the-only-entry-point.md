---
type: verdicts
title: hub-is-the-only-entry-point
description: The hub is the only way to open a project session; nobody starts or opens a single project server directly.
status: stable
tags: [hub, architecture]
generated: { by: human:arthur0n, at: 2026-11-09T13:45:55.710Z }
---

The hub is the only way to open a project session; nobody starts or opens a single project server directly.

## Why

Several projects at once is the normal case, and one entry point gives one place for status, ports and permissions.
Every session then runs as a web-UI session, where the plugin and its hooks load.
Owner's words (epic #59, 2026-10-29): "From now on, is always hub."

## Context

Harvest 2026-11-09: two windows juggled with reports pasted between a trunk and a project session; a terminal window on the project had no spend gate.

## Rejected

Project servers opened directly beside the hub: two entry points, two behaviours.

## Consequences

`npm start` on one project becomes a step the hub runs, not a documented entry point.
