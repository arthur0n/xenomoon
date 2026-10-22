---
name: connections-package-separate-repo
kind: verdicts
description: Two repos: the platform (workflow app, infra, docs) and a published connections package shared by agents, pipelines and the ETL, because a package is the only shape that does not fork the connections.
status: amended
tags: [connections, deps]
date: 2026-09-03
source: platform D9
---

# Platform repo plus a shared connections package

## Context

External-system clients (ERP auth, signed HTTP, retries) are needed by agents, pipelines and a separate ETL.
Copies drift.

## Decision

Two repos: the platform (workflow app, VM and infra, docs, issues) and a connections package published to a
registry. The ETL stays a separate repo and consumes the same package; it keeps its own query statements,
since statements live with the code that uses them. The platform imports connections, never a vendor SDK.
As an internal package it is consumed on a caret range, not an exact pin.

## Why

- One client implementation, one test set, reused by every consumer.
- A boundary check (an allow-list of runtime dependencies) enforces "no vendor SDK" in the platform.
