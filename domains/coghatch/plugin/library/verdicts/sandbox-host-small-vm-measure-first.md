---
type: verdicts
title: Keep the small VM and measure first
description: The agent harness and its sandboxes stay on the existing small VM; every sandbox container is capped from day one and per-container metrics are the resize trigger.
status: stable
tags: [agent-forge, infra, sandbox]
source: forge D3
generated: { by: human:migrate, at: 2026-09-21T00:00:00Z }
---

The agent harness and its sandboxes stay on the existing small VM; every sandbox container is capped from day one and per-container metrics are the resize trigger.

## Why

A guess at size is not a measurement. Caps bound each container; metrics show how close the VM runs.

## Context

Do not resize up front. Put CPU, memory and process caps on every sandbox container from the first day, record per-container usage, and resize only when the numbers say so.

Code sandboxes add containers to a VM that already runs the workflow engine, Postgres and the pipelines app.
