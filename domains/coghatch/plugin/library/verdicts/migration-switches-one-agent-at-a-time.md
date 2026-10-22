---
name: migration-switches-one-agent-at-a-time
kind: verdicts
description: Callers move to the new harness one agent at a time, each switch proven and soaked for a day, with exactly one runtime serving a given agent and no dual path.
status: amended
amends: [agent-harness-adoption-in-two-halves]
tags: [agent-forge, migration]
date: 2026-09-28
source: forge A28
---

# Switch one agent at a time

## Context

The plan said one switch re-pointing all callers at once. Agents had different readiness and different callers.

## Decision

The simplest proven agent goes first, then the others, each after its own proof. A switch is that agent's caller adapters re-pointed, proven, one day of soak, then the next. At any moment exactly one runtime serves a given agent; the old runtime never calls the new one; no shim. A pipeline-call proof gates the first switch.

## Why

A failure touches one agent, and each proof is small enough to read.
