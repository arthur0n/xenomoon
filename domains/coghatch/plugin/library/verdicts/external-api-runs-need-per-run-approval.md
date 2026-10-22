---
name: external-api-runs-need-per-run-approval
kind: verdicts
description: Commands that call external business APIs are blocked by a hook unless an approval flag is set, and the flag is set only after the owner approves that specific run.
status: accepted
tags: [security, process, connections]
date: 2026-08-19
source: warehouse convention
---

# External API runs need per-run approval

## Context

An orphaned loop once ran many unattended windows against the ERP.

## Decision

A hook blocks external-API commands unless an approval variable is present; it is set only after the owner approves that run. After any interrupted or rejected call, verify the process actually stopped.

## Why

External systems have rate limits and real data; an agent must not start runs on its own.
