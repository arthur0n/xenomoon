---
type: verdicts
title: hub-does-not-frame-or-proxy
description: Each project runs as its own server process; the hub does not frame or proxy a project page, it links to it.
status: stable
tags: [hub, architecture]
generated: { by: human:arthur0n, at: 2026-11-17T14:56:09.946Z }
supersedes: [one-process-per-project]
---

Each project runs as its own server process; the hub does not frame or proxy a project page, it links to it.

## Why

Each project is its own server process on its own port, with its own configuration (project folder, port, domain) and its own environment, so the owner can open it directly.
A crash or restart of one project does not touch the others.
The hub reads status from the project's stream and shows it as rows.

## Rejected

The hub frames a project page.
The hub proxies a project page.

## Consequences

The hub never hosts a project session in-process, never imports a project's session code and never serves a project's page.
In-process MCP tools and `process.env` are per process, so projects cannot collide.
