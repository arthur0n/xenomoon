---
name: container-stats-via-journal
kind: verdicts
description: Per-container CPU and memory are sampled once a minute by a small script on a systemd timer and carried to Cloud Logging by the existing journald receiver; no Docker receiver, no cAdvisor.
status: accepted
amends: [ops-agent-journald-host-metrics]
tags: [observability, infra]
date: 2026-09-26
source: platform D31
---

# Container stats through the journal

## Context

Container limits need to be set against real use, and an out-of-memory incident showed per-container memory
was not visible.

## Decision

A script run by a systemd timer once a minute writes one JSON line per container to the journal; the
existing journald receiver ships it. Added log volume is measured after install. The script is tested
against a fake `docker` and proven against real Docker output.

## Why

- Reuses the pipeline already in place; adds no agent and no container.
