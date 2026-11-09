---
type: verdicts
title: Sandbox contract suite gates both images
description: The Docker sandbox provider contract suite runs in CI on every run and before every sandbox image push, and its checks fail on missing evidence instead of reading zero.
status: stable
tags: [ci, sandbox, testing]
source: forge A22
generated: { by: human:migrate, at: 2026-09-26T00:00:00Z }
---

The Docker sandbox provider contract suite runs in CI on every run and before every sandbox image push, and its checks fail on missing evidence instead of reading zero.

## Why

A test that cannot see what it measures must fail, not pass with zero.

## Context

CI builds the sandbox image into the runner and runs the provider contract suite against it on every validate run, with no path filter (the measured cost is small). The same suite gates the sandbox image push. Process counts are read from /proc, and the test first proves it can list its own process.

A timeout test counted survivors with ps, but the sandbox image has no ps, so the count always read zero without checking anything.
