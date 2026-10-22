---
name: migration-switches-forward-only
kind: verdicts
description: For a while the rollback gate was dropped — a failure after a switch was to be fixed forward, never by pointing the agent back to the old runtime.
status: superseded
amends: [cutover-with-caps-and-recorder-not-metrics-wait]
tags: [agent-forge, migration]
date: 2026-09-28
source: forge A30
---

# Switches are forward-only

## Context

The plan held a rollback runbook and rehearsal as a gate before each switch, for a runtime that would not be used again.

## Decision

No rollback gate, no runbook, no rehearsal. A failure after a switch is fixed forward. Caps and the usage recorder stay as the gate.

## Why

One prerequisite fewer. Superseded the next day: a written switch-back runbook came back, without being a gate.
