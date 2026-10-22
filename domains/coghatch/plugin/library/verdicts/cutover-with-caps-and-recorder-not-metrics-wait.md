---
name: cutover-with-caps-and-recorder-not-metrics-wait
kind: verdicts
description: Cutover did not wait for two weeks of quiet-pilot metrics; it needed every long-running service capped and a per-container usage recorder running, with the shared-VM memory risk accepted.
status: amended
tags: [agent-forge, migration, observability, infra]
date: 2026-09-26
source: forge A24
---

# Cut over with caps and a recorder, not a metrics wait

## Context

The pilot gate asked for two weeks of metrics, but a quiet pilot measures little. Sandboxes have no global ceiling, so many busy ones could exhaust VM memory.

## Decision

Half 2 may start when every long-running service has CPU, memory and process caps and a recorder writes per-container CPU and memory by label every minute into central logging. The concurrent-sandbox risk is accepted; the resize threshold is set later from recorded numbers.

## Why

Real use measures the load that matters. Caps bound each container; the recorder shows how close the VM runs.
