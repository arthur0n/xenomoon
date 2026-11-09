---
type: verdicts
title: hub-reads-the-registry-and-writes-nothing
description: The hub's tab list comes from `~/.xenomoon/installs.json` plus each install's saved profiles; the hub writes no state of its own and commits nothing.
status: draft
tags: [hub, architecture, registry]
generated: { by: human:arthur0n, at: 2026-11-09T13:45:55.887Z }
---

The hub's tab list comes from `~/.xenomoon/installs.json` plus each install's saved profiles; the hub writes no state of its own and commits nothing.

## Why

The registry and the profile map already describe every project on the machine; a second list would drift from the first.
A hub that only reads and launches cannot corrupt a project.

## Context

ui/server/cli/install-registry.js; start-profile.js `projects` map; #63.
The registry holds no port: ports stay in each install's `.xenomoon.json` (ui/server/cli/port-pick.js).

## Rejected

A hub-owned config listing projects and ports.

## Consequences

Adding a project goes through the install's profile command, which the hub's `+` tab calls.
