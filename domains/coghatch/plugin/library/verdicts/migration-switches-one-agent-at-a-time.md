---
type: verdicts
title: Switch one agent at a time
description: Callers move to the new harness one agent at a time, each switch proven and soaked for a day, with exactly one runtime serving a given agent and no dual path.
status: stable
amends: [agent-harness-adoption-in-two-halves]
tags: [agent-forge, migration]
source: forge A28
generated: { by: human:migrate, at: 2026-09-28T00:00:00Z }
---

Callers move to the new harness one agent at a time, each switch proven and soaked for a day, with exactly one runtime serving a given agent and no dual path.

## Why

A failure touches one agent, and each proof is small enough to read.

## Context

The simplest proven agent goes first, then the others, each after its own proof. A switch is that agent's caller adapters re-pointed, proven, one day of soak, then the next. At any moment exactly one runtime serves a given agent; the old runtime never calls the new one; no shim. A pipeline-call proof gates the first switch.

The plan said one switch re-pointing all callers at once. Agents had different readiness and different callers.
