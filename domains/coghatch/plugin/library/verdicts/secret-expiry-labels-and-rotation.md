---
name: secret-expiry-labels-and-rotation
kind: verdicts
description: Every long-lived secret the boot script reads carries an expires label, the hourly sampler logs its days-to-expiry, an alert fires 30 days before, and rotation is one new version plus one restart with the origin delete last.
status: accepted
amends: [internal-proxy-tls-private-ca]
tags: [secrets, security, observability]
date: 2026-10-13
source: platform D40
---

# Secret expiry labels, alerts and rotation order

## Context

Some secrets expire at the vendor (an Entra client secret is capped at 24 months); others are self-issued
with no expiry. Nobody was alerted before any of them lapsed.

## Decision

Each listed secret carries a Secret Manager label `expires=YYYY-MM-DD`; vendor-capped secrets use the vendor
limit, self-issued or no-expiry tokens use 1 year (the same cadence as the proxy certificate). The existing
expiry sampler reads every label and writes one journal line per secret; all-or-nothing, so one bad label
means no lines and the absence alert fires. The runtime identity gets viewer on each secret, never
project-wide. Rotation: new credential at the origin → piped into a new version (never a file) → restart →
verify → advance the label → disable the old version → delete the old origin credential last. Rollback
re-adds the old value as a new version.

## Why

- The fact belongs on the secret it describes, not in the conf.
- Re-open if the vendor itself notifies before expiry.
