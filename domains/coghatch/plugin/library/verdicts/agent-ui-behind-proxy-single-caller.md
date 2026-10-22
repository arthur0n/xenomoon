---
name: agent-ui-behind-proxy-single-caller
kind: verdicts
description: The VM proxy forwards to the agent harness as a third upstream under one stripped path prefix for exactly one caller, the access hub; any other caller gets the same bare 401, enforced in code.
status: accepted
amends: [vm-no-public-ip-cloud-nat]
tags: [network, security, auth, agent-forge]
date: 2026-09-30
source: platform D34
---

# Agent harness UI behind the proxy, one caller

## Context

Staff should reach the agent harness UI only through the access hub (identity-provider sign-in, hub ACL). The
hub already reaches the VM proxy with its Google ID token.

## Decision

A third proxy route under one path prefix, stripped on the way up, all methods the harness uses. The proxy
compares the verified token email to one configured caller (which must also be on the general allow-list);
anyone else gets a bare 401 before any upstream socket. Boot refuses a conf the proxy would refuse. The route
has its own request and response header allow-lists: it forwards `cookie` up and each `set-cookie` back
(the hub forwards only the harness's named cookies and binds them to its session), and drops `authorization`
and headers that would attach MCP servers or skills to a turn. Machine callers reach the harness on the
compose network, not through the proxy.

## Why

- One caller makes the access path auditable. Re-open if a second caller needs the UI.
- Accepted: a chunked request later refused for size has already sent its headers to the harness.
