---
name: connection-shared-layer-vendor-neutral
kind: verdicts
description: The shared request layer of the connections package carries the generic wheel for every system — per-request timeouts, Retry-After on 429, a token cache with expiry skew and one 401 replay, a static-credential helper, and a scaffold for each new system.
status: accepted
tags: [connections, network]
date: 2026-09-11
source: connections 2026-09-11
---

# One vendor-neutral shared layer

## Context

Auth and retry code was repeated per system, and the token cache and 401 replay sat inside one vendor's module.

## Decision

Move the generic parts into the shared layer, which names no vendor: config-driven per-request deadlines with a written default, Retry-After honoured on 429, the one-slot token cache with expiry skew and single 401 replay, and a helper that reads one named env value, fails by name and builds fixed headers. A fixed folder layout per system makes a new API-key system a mechanical add. Runtime dependencies enter only through an allow-list that starts empty.

## Why

Each system inherits timeouts and retries for free, and new systems shrink to their specifics.
