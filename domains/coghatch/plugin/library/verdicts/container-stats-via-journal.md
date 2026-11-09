---
type: verdicts
title: Container stats through the journal
description: Per-container CPU and memory are sampled once a minute by a small script on a systemd timer and carried to Cloud Logging by the existing journald receiver; no Docker receiver, no cAdvisor.
status: stable
amends: [ops-agent-journald-host-metrics]
tags: [observability, infra]
source: platform D31
generated: { by: human:migrate, at: 2026-09-26T00:00:00Z }
---

Per-container CPU and memory are sampled once a minute by a small script on a systemd timer and carried to Cloud Logging by the existing journald receiver; no Docker receiver, no cAdvisor.

## Why

- Reuses the pipeline already in place; adds no agent and no container.

## Context

A script run by a systemd timer once a minute writes one JSON line per container to the journal; the
existing journald receiver ships it. Added log volume is measured after install. The script is tested
against a fake `docker` and proven against real Docker output.

Container limits need to be set against real use, and an out-of-memory incident showed per-container memory
was not visible.
