---
type: verdicts
title: Dry-run gate on every write (replaced)
description: Every write step (ERP POST, mail send) first sat behind a dry-run flag that logged the payload without posting, because no meaningful ERP sandbox was available.
status: deprecated
tags: [testing, security]
source: platform D3
generated: { by: human:migrate, at: 2026-09-03T00:00:00Z }
---

Every write step (ERP POST, mail send) first sat behind a dry-run flag that logged the payload without posting, because no meaningful ERP sandbox was available.

## Why

- A dry run against production data proves the payload without the side effect.
- Mail was later ruled not a write, and the gate itself was dropped for the MVP (see the superseding record).

## Context

Production with a dry-run gate: every write step logs its payload instead of posting, until the flag is
flipped.

The platform runs against production ERP data. A separate sandbox was not available on terms that would
make a test meaningful.
