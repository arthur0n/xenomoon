---
type: verdicts
title: One query call site carries cap and labels
description: Every warehouse query job goes through one function that sets location, the billed-bytes cap and cost labels, so none of them can be forgotten at a call site.
status: stable
tags: [data-warehouse, cost]
source: warehouse bigquery
generated: { by: human:migrate, at: 2026-08-26T00:00:00Z }
---

Every warehouse query job goes through one function that sets location, the billed-bytes cap and cost labels, so none of them can be forgotten at a call site.

## Why

A rule held in one place is enforced; a rule repeated per call site is forgotten.

## Context

All query jobs (queries, MERGE, checks, counts) go through one function that sets location and the byte cap from config and the label triple. The library exports no raw client; a caller needing the client takes it as a parameter. Load jobs cannot carry labels through the SDK; that gap is accepted as a library limit.

The MERGE built its own query job and repeated the options by hand.
