---
type: verdicts
title: One run at a time; size the VM by measurement
description: Pipelines process one run at a time, so volume does not size the machine; the VM is sized by measured memory, not by run count.
status: stable
tags: [workflow-engine, infra]
source: platform D4
generated: { by: human:migrate, at: 2026-09-03T00:00:00Z }
---

Pipelines process one run at a time, so volume does not size the machine; the VM is sized by measured memory, not by run count.

## Why

- "Job and queue, process one by one": queued runs cost database rows, not CPU.
- Volume only grows run-history disk, which a disk alert guards.

## Context

Each pipeline runs one job at a time (concurrency 1). Start on a small VM (`e2-small`), measure, resize when
a measurement says so. It was later resized to `e2-medium` after an out-of-memory kill caused by the agent
server and its sandboxes sharing the VM: memory, not run volume, was the shortfall.

Mail volume was a sizing question. Runs queue in the workflow engine, so concurrency is a choice.
