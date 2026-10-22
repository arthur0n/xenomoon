---
name: shared-helpers-may-import-contract-types
kind: verdicts
description: The shared helpers folder may import contracts as types only, giving the layering contracts then shared then adapters, pipelines and app, because helpers shared by two pipelines are often typed by a contract.
status: accepted
amends: [contracts-and-adapters-per-capability]
tags: [deps]
date: 2026-09-10
source: platform D16
---

# Shared helpers may import contract types

## Context

Two rules collided on the second pipeline: "code two pipelines share lives in `shared/`" and "`shared/`
imports nothing". Many shared helpers are typed by a contract.

## Decision

`shared/` may `import type` from `contracts/`. Layering is `contracts/` (types) → `shared/` (plain helpers)
→ `adapters/`, `pipelines/`, `app/`, `proxy/`. `contracts/` stays self-contained. A workaround that bent
the old rule was deleted.

## Why

- Copying into a pipeline is forbidden; putting logic under `app/` misplaces it.
- Contracts export no values, so no runtime coupling or cycle can enter `shared/`.
- A rule is followed or discussed, never bent.
