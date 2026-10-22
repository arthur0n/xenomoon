---
name: per-client-values-in-config-file
kind: verdicts
description: Per-client values (project, dataset, location, byte cap, raw bucket) live only in one config file; code reads config and never holds constants, required keys fail loudly, and the planning time zone defaults to UTC.
status: accepted
tags: [data-warehouse, etl]
date: 2026-08-26
source: warehouse config
---

# Per-client values live in one config file

## Context

The ETL is copied to other clients; anything hardcoded must be found and changed by hand.

## Decision

One env-style config file per client with required keys and validation (the byte cap must be a positive integer). Every infra client and entrypoint reads it. The planning time zone is optional, defaulting to UTC, with no extra wiring. No secrets in config.

## Why

A new client changes one file, and a missing value fails at start, not mid-run.
