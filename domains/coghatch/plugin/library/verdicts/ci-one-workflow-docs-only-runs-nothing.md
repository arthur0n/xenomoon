---
type: verdicts
title: One CI workflow; docs-only changes run nothing
description: The fork has one CI workflow with gate, store-contract, migration-order and build jobs; Windows is not a target, and docs-only changes run nothing.
status: stable
tags: [ci]
source: forge A19
generated: { by: human:migrate, at: 2026-09-26T00:00:00Z }
---

The fork has one CI workflow with gate, store-contract, migration-order and build jobs; Windows is not a target, and docs-only changes run nothing.

## Why

One place to read what gates a merge. Docs-only commits rely on the local gate, which is cheaper than a full CI run.

## Context

One validate workflow. Jobs: the gate; the store contract tests on SQLite and on a digest-pinned Postgres service (fails if the database is unreachable, never skips); a migration-order check against the last green main run (fails closed); and the image build, main only, after the others. Pull-request runs cancel older runs on the same ref; push runs never cancel each other. Changes that touch only docs or Markdown run nothing (agent prompts count as code). No Windows job.

The fork inherited several upstream workflows and a Windows job. The server runs on Linux and developers use macOS.
