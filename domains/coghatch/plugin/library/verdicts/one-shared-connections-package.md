---
type: verdicts
title: One shared connections package
description: ERP and other source-system connection code comes from one shared connections package used by every repo; no repo keeps its own copy, and the package's behaviour is adopted as the spec.
status: stable
tags: [connections, deps]
source: warehouse convention
generated: { by: human:migrate, at: 2026-09-19T00:00:00Z }
---

ERP and other source-system connection code comes from one shared connections package used by every repo; no repo keeps its own copy, and the package's behaviour is adopted as the spec.

## Why

One fix reaches every consumer; behaviour does not drift between repos.

## Context

The connections package is the only copy. A repo keeps only its own glue and test data. The package's timeouts, Retry-After handling, typed errors and redacting previews are adopted as a whole, not ruled on one by one.

Several repos carried their own copies of the same ERP auth and query code.
