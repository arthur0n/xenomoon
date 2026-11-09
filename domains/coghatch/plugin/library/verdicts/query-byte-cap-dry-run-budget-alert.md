---
type: verdicts
title: Byte cap, dry run, budget alert
description: Every warehouse query runs with a billed-bytes cap from config, non-trivial queries are dry-run first, and every project has a low budget alert; billable features need the owner's approval.
status: stable
tags: [data-warehouse, cost]
source: warehouse convention
generated: { by: human:migrate, at: 2026-08-18T00:00:00Z }
---

Every warehouse query runs with a billed-bytes cap from config, non-trivial queries are dry-run first, and every project has a low budget alert; billable features need the owner's approval.

## Why

A capped query aborts for free; an alert catches anything the caps miss.

## Context

A maximum-bytes-billed cap (from config) on every query; dry-run before every non-trivial query; a budget alert at about one dollar on every project, and all activity stops if it fires. Select only needed columns, partition and cluster large tables. No transfer service, BI engine or reservations without approval.

With billing attached, overruns are charged, not blocked. The goal is to stay inside the free tier.
