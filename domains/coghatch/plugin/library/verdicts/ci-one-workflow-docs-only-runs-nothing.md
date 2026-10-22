---
name: ci-one-workflow-docs-only-runs-nothing
kind: verdicts
description: The fork has one CI workflow with gate, store-contract, migration-order and build jobs; Windows is not a target, and docs-only changes run nothing.
status: amended
tags: [ci]
date: 2026-09-26
source: forge A19
---

# One CI workflow; docs-only changes run nothing

## Context

The fork inherited several upstream workflows and a Windows job. The server runs on Linux and developers use macOS.

## Decision

One validate workflow. Jobs: the gate; the store contract tests on SQLite and on a digest-pinned Postgres service (fails if the database is unreachable, never skips); a migration-order check against the last green main run (fails closed); and the image build, main only, after the others. Pull-request runs cancel older runs on the same ref; push runs never cancel each other. Changes that touch only docs or Markdown run nothing (agent prompts count as code). No Windows job.

## Why

One place to read what gates a merge. Docs-only commits rely on the local gate, which is cheaper than a full CI run.
