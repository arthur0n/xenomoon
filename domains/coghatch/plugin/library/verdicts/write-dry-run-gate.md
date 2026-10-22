---
name: write-dry-run-gate
kind: verdicts
description: Every write step (ERP POST, mail send) first sat behind a dry-run flag that logged the payload without posting, because no meaningful ERP sandbox was available.
status: superseded
tags: [testing, security]
date: 2026-09-03
source: platform D3
---

# Dry-run gate on every write (replaced)

## Context

The platform runs against production ERP data. A separate sandbox was not available on terms that would
make a test meaningful.

## Decision

Production with a dry-run gate: every write step logs its payload instead of posting, until the flag is
flipped.

## Why

- A dry run against production data proves the payload without the side effect.
- Mail was later ruled not a write, and the gate itself was dropped for the MVP (see the superseding record).
