---
type: verdicts
title: Idempotent ERP writes by external id
description: An ERP create is idempotent by construction: a key derived from the triggering message is set as the record's external id, read before any POST and re-read after every refusal, so stacked retries never open a second record.
status: stable
amends: [one-function-per-pipeline-step-per-io]
tags: [workflow-engine, connections]
source: platform D14
generated: { by: human:migrate, at: 2026-09-21T00:00:00Z }
---

An ERP create is idempotent by construction: a key derived from the triggering message is set as the record's external id, read before any POST and re-read after every refusal, so stacked retries never open a second record.

## Why

- A timeout does not prove the write did not happen; only a read by key does.
- Every retry path becomes safe without coordinating them.

## Context

The write key is a sha256 of the source message id, sent as the record's external id. Before any POST, read
by that key; if found, return it as recovered. Every refusal is re-read by key before being called refused: a
5xx miss retries, a 4xx miss alerts. A duplicate refusal from the ERP counts as success after re-read. The
transport sends the POST once (attempts capped at 1); the external id, not the send count, prevents
duplicates. A rerun with edited input under the same key recovers the existing record rather than posting
the edit; accepted for now.

Three retry layers stack over one write: the step's own retry, the engine's per-step retry, and an operator
rerun-from-step. Each could post the same record twice.
