---
type: verdicts
title: A missing gate tool fails the gate
description: A gate step whose tool is missing fails the gate, never skips; zero lint warnings is stated identically everywhere lint runs, and the build always starts from a clean output folder.
status: stable
tags: [ci, quality, security]
source: warehouse quality-toolchain
generated: { by: human:migrate, at: 2026-09-21T00:00:00Z }
---

A gate step whose tool is missing fails the gate, never skips; zero lint warnings is stated identically everywhere lint runs, and the build always starts from a clean output folder.

## Why

Making a failure easier to silence is forbidden; a green gate must mean every check ran.

## Context

Missing tool equals fail for every security-relevant step. The zero-warning lint contract is the same in the script, the config and the pre-commit hook. The gate builds first and the build deletes its output folder, so packaging checks never read a stale tree. The two TypeScript projects (emit and tooling) stay exact complements.

A security step that silently skips when its binary is absent gives a green gate with no check.
