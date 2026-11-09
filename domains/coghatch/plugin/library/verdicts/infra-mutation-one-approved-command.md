---
type: verdicts
title: Infra: an issue first, then one approved command, then its output
description: Every cloud or server mutation is written into an issue first, approved per command, run once exactly as printed, and its output pasted back; read-only checks may run first.
status: stable
tags: [convention, infra]
generated: { by: human:migrate, at: 2026-09-03T00:00:00Z }
---

Every cloud or server mutation is written into an issue first, approved per command, run once exactly as printed, and its output pasted back; read-only checks may run first.

## Why

The issue becomes the audit trail; running first and pasting after is the order this rule forbids.

## Context

- Any command that creates, changes or deletes infrastructure or a running service (cloud CLI, secret writes,
  remote shell changes, compose rolls, settings calls) is printed in the issue with every flag before it runs.
- The owner approves it per command. It runs once, exactly as printed, and its output is pasted verbatim into the
  issue.
- `--dry-run` or `describe` first wherever the tool offers it; read-only checks may run before approval and are
  pasted too.
- A claim about infra state with no pasted output behind it is not a fact.

Infra changes made first and documented after left claims about cloud state with no output behind them.
