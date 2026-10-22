---
name: one-function-per-pipeline-step-per-io
kind: verdicts
description: One Inngest function per pipeline and one step per I/O or transform, each step a plain tested function taking one JSON input, so every step can be rerun from the dashboard with edited input.
status: amended
tags: [workflow-engine, testing]
date: 2026-09-05
source: platform D14
---

# One function per pipeline, one step per I/O

## Context

Rerun-from-step, per-step retry and memoization exist only inside one function run, and a step's output
crosses to the next step as JSON.

## Decision

Each pipeline has one composition file with a single `createFunction`; its handler is ordered
`step.run(ID, boundStep, input)` calls, `if` on memoized outputs, and `step.sleep`. Payload narrowing runs
before the first step, so a bad payload fails once and non-retriably. Each step is a plain function with
JSON-only input and result types plus its own test file. Step ids are frozen constants, never renamed or
reused. Lint enforces: a step is a named, bound function given one plain JSON input (no inline callback, no
aliasing `step.run`); a gate check requires a sibling test for every logic file. Branches become `if`, loops
become step retry; legacy bugs are rulings, not ported.

## Why

- Simple, and re-executable per step when there are issues; a step can be frozen with its test.
- A callback records no input, so the dashboard could not replace it on rerun.
