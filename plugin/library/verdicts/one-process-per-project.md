---
type: verdicts
title: one-process-per-project
description: Each project runs as its own server process behind the hub; the hub never hosts a project session in-process.
status: stable
tags: [hub, architecture]
generated: { by: human:arthur0n, at: 2026-11-09T13:45:55.751Z }
---

Each project runs as its own server process behind the hub; the hub never hosts a project session in-process.

## Why

`PROJECT_DIR`, `PORT` and `DOMAIN` are read once per process (ui/server/core/config.js), so a process is a project.
A crash or restart of one project does not touch the others.
In-process MCP tools and `process.env` are per process, so they cannot collide.

## Context

Epic #59 Facts §1 and §3 (2026-10-30).

## Rejected

One multi-tenant server for several projects: every module constant in config.js would become per-request state.

## Consequences

The hub frames and proxies; it never imports a project's session code.
