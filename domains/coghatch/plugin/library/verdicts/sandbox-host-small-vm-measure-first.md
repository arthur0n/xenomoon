---
name: sandbox-host-small-vm-measure-first
kind: verdicts
description: The agent harness and its sandboxes stay on the existing small VM; every sandbox container is capped from day one and per-container metrics are the resize trigger.
status: accepted
tags: [agent-forge, infra, sandbox]
date: 2026-09-21
source: forge D3
---

# Keep the small VM and measure first

## Context

Code sandboxes add containers to a VM that already runs the workflow engine, Postgres and the pipelines app.

## Decision

Do not resize up front. Put CPU, memory and process caps on every sandbox container from the first day, record per-container usage, and resize only when the numbers say so.

## Why

A guess at size is not a measurement. Caps bound each container; metrics show how close the VM runs.
