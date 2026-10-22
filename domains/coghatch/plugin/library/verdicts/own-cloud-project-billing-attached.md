---
name: own-cloud-project-billing-attached
kind: verdicts
description: The warehouse lives in the client's own cloud project with billing attached (so tables never expire) while usage stays inside the free tier, guarded by a low budget alert.
status: accepted
tags: [data-warehouse, cost, infra]
date: 2026-08-18
source: warehouse convention
---

# Own project, billing attached, free-tier target

## Context

Moving the warehouse off a vendor's account onto the client's own. A sandbox project without billing deletes tables after 60 days.

## Decision

One project owned by the client, billing linked, every usage sized for the always-free allowances, a budget alert on any spend. Container jobs are not free and are measured, not assumed.

## Why

No table expiry, and spend stays near zero and visible.
