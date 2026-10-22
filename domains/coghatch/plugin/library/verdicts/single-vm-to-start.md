---
name: single-vm-to-start
kind: verdicts
description: Start with one VM running the workflow server, Postgres, Redis and the pipelines app; the server container gets no application secrets, only its own keys.
status: accepted
tags: [infra, secrets, workflow-engine]
date: 2026-09-03
source: platform D6
---

# One machine to start

## Context

One operator, one pipeline at the start. The workflow engine needs a server, Postgres and Redis, plus the
app that serves the pipeline functions.

## Decision

Run everything on one VM. The workflow server container receives only its own event key, signing key and
Postgres URI, never an application secret. Move the app to a managed runtime (for example Cloud Run with a
`connect()` worker) when a second pipeline or a second operator arrives.

## Why

- A second machine would be operations without a reason at this size.
- Secret separation limits what a compromise of the workflow server can reach.
- The trigger to split is written down, so the single VM is a start, not a ceiling.
