---
type: verdicts
title: Every exported function is unit-tested
description: Every exported function has unit tests; a behaviour-preserving change keeps the same test names and bodies, a behaviour change ships its pinning test, and coverage never goes down.
status: stable
tags: [testing, quality]
source: warehouse convention
generated: { by: human:migrate, at: 2026-08-26T00:00:00Z }
---

Every exported function has unit tests; a behaviour-preserving change keeps the same test names and bodies, a behaviour change ships its pinning test, and coverage never goes down.

## Why

Without a second human, tests are the only independent check.

## Context

Tests and the gate are the reviewer. Every export has tests. A refactor proves sameness with unchanged tests; a behaviour change adds the test for the new behaviour. Coverage never drops in a change.

A solo developer building for an enterprise client has no human reviewer behind the agent.
