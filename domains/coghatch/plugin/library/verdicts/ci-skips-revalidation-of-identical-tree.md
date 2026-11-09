---
type: verdicts
title: Do not re-validate an identical tree on main
description: A push to main skips the validation jobs when the same repo's own validate run already passed on the identical git tree, proven by a tree-named artifact; the build still runs.
status: stable
amends: [ci-one-workflow-docs-only-runs-nothing]
tags: [ci]
source: forge A38
generated: { by: human:migrate, at: 2026-10-01T00:00:00Z }
---

A push to main skips the validation jobs when the same repo's own validate run already passed on the identical git tree, proven by a tree-named artifact; the build still runs.

## Why

Same tree, same result. The artifact is the proof, not a guess.

## Context

A preflight job compares the pushed tree hash with recent successful same-repo PR runs. The gate job uploads a tested-tree artifact only when it passes, so a failed gate records nothing. Validation jobs skip only on a match; the image build runs when they all skipped by a match or all passed. Migration order is always checked.

A merge push re-ran every validation job on a tree identical to the already-green PR run, about 15 billed job-minutes per merge.
