---
type: verdicts
title: hub-reads-the-registry-and-writes-nothing
description: The hub's rows come from `~/.xenomoon/installs.json` plus each install's saved profiles; the hub writes no project or registry state and commits nothing; its only writes are its own diagnostics under `~/.xenomoon/hub/`.
status: stable
tags: [hub, architecture, registry]
generated: { by: human:arthur0n, at: 2026-11-09T13:45:55.887Z }
---

The hub's rows come from `~/.xenomoon/installs.json` plus each install's saved profiles; the hub writes no project or registry state and commits nothing; its only writes are its own diagnostics under `~/.xenomoon/hub/`.

## Why

The registry and the profile map already describe every project on the machine; a second list would drift from the first.
A hub that only reads and launches cannot corrupt a project.

## Context

ui/server/cli/install-registry.js; start-profile.js `projects` map; #63.
The registry holds no port: ports stay in each install's `.xenomoon.json` (ui/server/cli/port-pick.js).

## Rejected

A hub-owned config listing projects and ports.

- A hub that stays silent on a broken file. Owner, 2026-11-10, on what every hub step is judged by: "Your concern, your reasoning should be, when we are scale, right? We are working with more customers. How can we be effective? How can we work to not use that much resource?"

## Consequences

Adding a project goes through the install's profile command; the hub only reads the result.

- The hub reads the registry and each install's profiles through pure parsers that return ok or a reason; it never prunes or rewrites the registry. A file that fails to parse keeps the last good copy in memory, and the reason goes to ~/.xenomoon/hub/<hash>.error, never inside an install. The hub status lists these errors. Tech design line 2 of #63, confirmed by the owner ("ok", 2026-11-10); the resource frame is his quote under Rejected.
