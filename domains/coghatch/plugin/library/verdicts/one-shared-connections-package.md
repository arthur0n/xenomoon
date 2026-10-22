---
name: one-shared-connections-package
kind: verdicts
description: ERP and other source-system connection code comes from one shared connections package used by every repo; no repo keeps its own copy, and the package's behaviour is adopted as the spec.
status: accepted
tags: [connections, deps]
date: 2026-09-19
source: warehouse convention
---

# One shared connections package

## Context

Several repos carried their own copies of the same ERP auth and query code.

## Decision

The connections package is the only copy. A repo keeps only its own glue and test data. The package's timeouts, Retry-After handling, typed errors and redacting previews are adopted as a whole, not ruled on one by one.

## Why

One fix reaches every consumer; behaviour does not drift between repos.
