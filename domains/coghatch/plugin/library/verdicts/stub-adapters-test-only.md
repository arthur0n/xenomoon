---
type: verdicts
title: Stubs first, then stubs only in tests
description: Stubs came first for the proof of concept; from the MVP on, the composition root binds every live adapter and stub adapters are test doubles bound only in tests, never by an env switch.
status: stable
amends: [one-message-one-run-agent-owns-thread]
tags: [testing]
source: platform D17
generated: { by: human:migrate, at: 2026-09-11T00:00:00Z }
---

Stubs came first for the proof of concept; from the MVP on, the composition root binds every live adapter and stub adapters are test doubles bound only in tests, never by an env switch.

## Why

- Every live adapter landed behind an already tested contract.
- An env switch to stubs in production is a way to ship a run that does nothing.

## Context

"Stubs first" was the proof-of-concept rule. From the MVP on, the app's composition root binds the live
adapter of every capability. Stub adapters remain as test doubles, bound only in tests, never selected by an
environment switch.

The first pipeline was built with every external capability stubbed, so its shape, branches and
rerun-from-step were exercised before any live system.
