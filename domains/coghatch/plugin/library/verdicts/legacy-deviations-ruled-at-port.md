---
type: verdicts
title: Legacy deviations are ruled at port time
description: Deviations from a legacy flow's behaviour are build-time rulings taken one by one when each pipeline is ported, not up-front platform decisions.
status: stable
tags: [workflow-engine, testing]
source: platform D8
generated: { by: human:migrate, at: 2026-09-03T00:00:00Z }
---

Deviations from a legacy flow's behaviour are build-time rulings taken one by one when each pipeline is ported, not up-front platform decisions.

## Why

- Each deviation is a question about one pipeline, best answered with its code and data at hand.
- Recording rulings keeps "spec" and "flaw" apart for later readers.

## Context

Each deviation is a ruling about one pipeline's behaviour, taken when that pipeline is ported and recorded
when taken. A legacy behaviour ruled a flaw is not ported.

Porting flows from a previous automation vendor surfaced places where the legacy behaviour was arguably a
bug. Deciding all of them up front would mean deciding without the code in front of you.
