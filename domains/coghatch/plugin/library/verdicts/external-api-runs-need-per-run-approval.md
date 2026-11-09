---
type: verdicts
title: External API runs need per-run approval
description: Commands that call external business APIs are blocked by a hook unless an approval flag is set, and the flag is set only after the owner approves that specific run.
status: stable
tags: [security, process, connections]
source: warehouse convention
generated: { by: human:migrate, at: 2026-08-19T00:00:00Z }
---

Commands that call external business APIs are blocked by a hook unless an approval flag is set, and the flag is set only after the owner approves that specific run.

## Why

External systems have rate limits and real data; an agent must not start runs on its own.

## Context

A hook blocks external-API commands unless an approval variable is present; it is set only after the owner approves that run. After any interrupted or rejected call, verify the process actually stopped.

An orphaned loop once ran many unattended windows against the ERP.
