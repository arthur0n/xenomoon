---
name: access-hub-fronts-agent-harness-ui
kind: verdicts
description: The access hub has one upstream, the agent harness, and its portal opens that app's own UI; the OAuth and MCP surfaces stay built but unmounted until the agent tools are ported, so nothing serves tokens for a resource that serves nothing.
status: accepted
amends: [mcp-one-server-per-resource]
tags: [auth, mcp, agent-forge, infra]
date: 2026-09-30
source: hub M19
---

# One upstream, the agent harness; MCP unmounted until ported

## Context

The access hub first fronted a custom agent app and exposed its agents as MCP tools. The organisation
moved to the agent harness (a fork of the upstream agent harness), which has its own UI and
agent picker. The portal is the main surface; MCP tools proved the idea but nobody depends on them yet.

## Decision

- The registry has one entry, the agent harness, reached through the private VM proxy with the access
  hub's own cloud identity token; no caller token goes upstream. The proxy's private CA is added to the
  process trust store at boot.
- The ACL decides who gets into the whole app, not what they do inside it.
- Nothing is read from the upstream at boot; the access hub starts whether or not the VM is up.
- No identity headers go upstream, and any inbound header with the access hub's prefix is dropped.
- The OAuth and MCP routes are not mounted: they answer 501/405/404 like any unwired subsystem. The code
  stays in the tree until the port replaces it.
- Decided for the port: a job stores the harness session and turn ids; a turn without a final message,
  or with a pending action, is a failed job.
- Switch-back is a redeploy of the previous image, not a config selector.

## Why

Move once, run one runtime, build nothing that is thrown away later. A selector keeping two upstream
shapes would protect no user. The harness's pages run on the access hub's origin and are trusted as its own.
