---
name: every-exported-function-unit-tested
kind: verdicts
description: Every exported function has unit tests; a behaviour-preserving change keeps the same test names and bodies, a behaviour change ships its pinning test, and coverage never goes down.
status: accepted
tags: [testing, quality]
date: 2026-08-26
source: warehouse convention
---

# Every exported function is unit-tested

## Context

A solo developer building for an enterprise client has no human reviewer behind the agent.

## Decision

Tests and the gate are the reviewer. Every export has tests. A refactor proves sameness with unchanged tests; a behaviour change adds the test for the new behaviour. Coverage never drops in a change.

## Why

Without a second human, tests are the only independent check.
