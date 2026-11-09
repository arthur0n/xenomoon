---
type: verdicts
title: One vendor-neutral shared layer
description: The shared request layer of the connections package carries the generic wheel for every system — per-request timeouts, Retry-After on 429, a token cache with expiry skew and one 401 replay, a static-credential helper, and a scaffold for each new system.
status: stable
tags: [connections, network]
source: connections 2026-09-11
generated: { by: human:migrate, at: 2026-09-11T00:00:00Z }
---

The shared request layer of the connections package carries the generic wheel for every system — per-request timeouts, Retry-After on 429, a token cache with expiry skew and one 401 replay, a static-credential helper, and a scaffold for each new system.

## Why

Each system inherits timeouts and retries for free, and new systems shrink to their specifics.

## Context

Move the generic parts into the shared layer, which names no vendor: config-driven per-request deadlines with a written default, Retry-After honoured on 429, the one-slot token cache with expiry skew and single 401 replay, and a helper that reads one named env value, fails by name and builds fixed headers. A fixed folder layout per system makes a new API-key system a mechanical add. Runtime dependencies enter only through an allow-list that starts empty.

Auth and retry code was repeated per system, and the token cache and 401 replay sat inside one vendor's module.
