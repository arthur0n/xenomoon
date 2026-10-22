---
name: legacy-deviations-ruled-at-port
kind: verdicts
description: Deviations from a legacy flow's behaviour are build-time rulings taken one by one when each pipeline is ported, not up-front platform decisions.
status: accepted
tags: [workflow-engine, testing]
date: 2026-09-03
source: platform D8
---

# Legacy deviations are ruled at port time

## Context

Porting flows from a previous automation vendor surfaced places where the legacy behaviour was arguably a
bug. Deciding all of them up front would mean deciding without the code in front of you.

## Decision

Each deviation is a ruling about one pipeline's behaviour, taken when that pipeline is ported and recorded
when taken. A legacy behaviour ruled a flaw is not ported.

## Why

- Each deviation is a question about one pipeline, best answered with its code and data at hand.
- Recording rulings keeps "spec" and "flaw" apart for later readers.
