---
type: verdicts
title: Switches are forward-only
description: For a while the rollback gate was dropped — a failure after a switch was to be fixed forward, never by pointing the agent back to the old runtime.
status: deprecated
amends: [cutover-with-caps-and-recorder-not-metrics-wait]
tags: [agent-forge, migration]
source: forge A30
generated: { by: human:migrate, at: 2026-09-28T00:00:00Z }
---

For a while the rollback gate was dropped — a failure after a switch was to be fixed forward, never by pointing the agent back to the old runtime.

## Why

One prerequisite fewer. Superseded the next day: a written switch-back runbook came back, without being a gate.

## Context

No rollback gate, no runbook, no rehearsal. A failure after a switch is fixed forward. Caps and the usage recorder stay as the gate.

The plan held a rollback runbook and rehearsal as a gate before each switch, for a runtime that would not be used again.
