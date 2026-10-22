---
name: gate-missing-tool-fails
kind: verdicts
description: A gate step whose tool is missing fails the gate, never skips; zero lint warnings is stated identically everywhere lint runs, and the build always starts from a clean output folder.
status: accepted
tags: [ci, quality, security]
date: 2026-09-21
source: warehouse quality-toolchain
---

# A missing gate tool fails the gate

## Context

A security step that silently skips when its binary is absent gives a green gate with no check.

## Decision

Missing tool equals fail for every security-relevant step. The zero-warning lint contract is the same in the script, the config and the pre-commit hook. The gate builds first and the build deletes its output folder, so packaging checks never read a stale tree. The two TypeScript projects (emit and tooling) stay exact complements.

## Why

Making a failure easier to silence is forbidden; a green gate must mean every check ran.
