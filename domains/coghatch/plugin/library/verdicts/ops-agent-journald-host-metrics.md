---
name: ops-agent-journald-host-metrics
kind: verdicts
description: The Google Cloud Ops Agent runs on the VM with host metrics every 60 s and an explicitly configured journald receiver, because disk and backup alerts had no signal at all without it.
status: amended
tags: [observability, infra]
date: 2026-09-21
source: platform D29
---

# Ops Agent with an explicit journald receiver

## Context

The disk-usage metric returned no time series, and Compute Engine's built-in disk metrics are I/O counters,
not filesystem usage. Cloud Storage exposes no object-age metric, so backup freshness must come from logs.

## Decision

Install the Ops Agent: built-in `hostmetrics` at 60 s and a `systemd_journald` receiver configured explicitly
(the default Linux pipeline reads syslog files, not the journal). No new IAM grant was needed. Log and metric
volume is measured after install from billing metrics, not guessed.

## Why

- Rejected: a backup script writing its own log entry, because it would make the disk alert nightly-only, and
  the observed disk fill happened during the day.
- Cost sits inside free allotments at this volume.
