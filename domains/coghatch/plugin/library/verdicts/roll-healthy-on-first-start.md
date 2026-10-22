---
name: roll-healthy-on-first-start
kind: verdicts
description: A roll is healthy only when the first docker compose up --wait exits 0; a first start that passes only on the unit's retry is a bug, and a failing container gets a healthcheck grace sized from its measured cold start.
status: accepted
tags: [infra, ci]
date: 2026-10-10
source: platform D38
---

# Healthy means the first start passes

## Context

Two rolls in a row failed the first `up --wait` on one container's healthcheck and passed only on the
systemd retry: about 14 minutes instead of two. An automatic roll would read that as failure and roll back a
good release.

## Decision

Only a first `docker compose up -d --wait` exiting 0 is healthy. A container that failed a first start gets a
grace (`start_period`, then `interval × retries`) covering its longest cold start measured on the VM after an
image change (from its own start time to its first passing probe), the measurement written next to the value.
Other healthchecks keep their values until one fails. A change that adds start-up work re-measures the grace.
`Restart=on-failure` stays as a guard, not as how a roll succeeds.

## Why

- A grace that was never measured is an invented number.
- Only the healthchecks that really failed are touched.
