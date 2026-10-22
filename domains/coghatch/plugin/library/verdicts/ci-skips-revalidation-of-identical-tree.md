---
name: ci-skips-revalidation-of-identical-tree
kind: verdicts
description: A push to main skips the validation jobs when the same repo's own validate run already passed on the identical git tree, proven by a tree-named artifact; the build still runs.
status: accepted
amends: [ci-one-workflow-docs-only-runs-nothing]
tags: [ci]
date: 2026-10-01
source: forge A38
---

# Do not re-validate an identical tree on main

## Context

A merge push re-ran every validation job on a tree identical to the already-green PR run, about 15 billed job-minutes per merge.

## Decision

A preflight job compares the pushed tree hash with recent successful same-repo PR runs. The gate job uploads a tested-tree artifact only when it passes, so a failed gate records nothing. Validation jobs skip only on a match; the image build runs when they all skipped by a match or all passed. Migration order is always checked.

## Why

Same tree, same result. The artifact is the proof, not a guess.
