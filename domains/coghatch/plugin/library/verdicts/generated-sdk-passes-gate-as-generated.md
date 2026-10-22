---
name: generated-sdk-passes-gate-as-generated
kind: verdicts
description: A generated SDK passes the gate as generated — the generator is configured to the repo's manifest rules, its output is never hand-edited, and the size check skips generator-owned files.
status: accepted
amends: [size-limits-errors-on-own-files-only]
tags: [ci, quality, deps]
date: 2026-10-08
source: forge A46
---

# Generated SDK passes the gate as generated

## Context

A regeneration wrote an old Node engine range into the SDK manifest and added files the size check refused.

## Decision

The generator config carries what the convention check requires of every manifest (engine range, researched date, exact pins), so a regeneration is compliant and a second run changes nothing. The size check skips generator-owned files; hand-written files are listed by exact path in the generator's ignore file and stay checked.

## Why

Machine-written code is not 'wholly ours'; fixing the generator is better than editing its output.
