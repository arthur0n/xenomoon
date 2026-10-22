---
name: pipelines-run-one-at-a-time
kind: verdicts
description: Pipelines process one run at a time, so volume does not size the machine; the VM is sized by measured memory, not by run count.
status: accepted
tags: [workflow-engine, infra]
date: 2026-09-03
source: platform D4
---

# One run at a time; size the VM by measurement

## Context

Mail volume was a sizing question. Runs queue in the workflow engine, so concurrency is a choice.

## Decision

Each pipeline runs one job at a time (concurrency 1). Start on a small VM (`e2-small`), measure, resize when
a measurement says so. It was later resized to `e2-medium` after an out-of-memory kill caused by the agent
server and its sandboxes sharing the VM: memory, not run volume, was the shortfall.

## Why

- "Job and queue, process one by one": queued runs cost database rows, not CPU.
- Volume only grows run-history disk, which a disk alert guards.
