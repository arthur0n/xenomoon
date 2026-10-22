---
name: contracts-and-adapters-per-capability
kind: verdicts
description: Each capability has one closed, types-only contract file and its own live and stub adapters; only a deployable's composition root imports adapters, and the gate enforces it.
status: amended
tags: [testing, deps]
date: 2026-09-05
source: platform D16
---

# Closed contracts and adapters per capability

## Context

Pipelines need external capabilities (item lookup, mailer, file store, record writer) that must be testable
with stubs and swappable without touching logic.

## Decision

`contracts/<capability>.ts` holds one interface, types only (every value form refused by the gate), named by
what it does. A committed contract changes only for a recorded reason; the usual change is a new file, its
consumers move, the old file is deleted. `adapters/<capability>/{live,stub}.ts` implement it. Only a
deployable's composition root imports adapters. Pipelines import contracts as `import type` only. CI refuses
a modified contract file (only add or delete).

## Why

- Folder names carry the rule: a reader knows a contract on sight.
- A closed contract keeps every adapter and step honest about the same shape.
- Chosen over per-system bindings and per-pipeline contracts (duplication).
