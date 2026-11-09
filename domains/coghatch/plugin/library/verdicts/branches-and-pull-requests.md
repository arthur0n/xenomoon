---
type: verdicts
title: Branches and pull requests
description: Code reaches main only through a pull request from a `<label>/<issue>-<slug>` branch rebased and gated before the push; docs-only changes may go straight to main.
status: stable
tags: [convention, git]
generated: { by: human:migrate, at: 2026-09-26T00:00:00Z }
---

Code reaches main only through a pull request from a `<label>/<issue>-<slug>` branch rebased and gated before the push; docs-only changes may go straight to main.

## Why

Review happens once, on a branch that already passes the gate.

## Context

- Code reaches `main` only through a pull request. Docs-only changes (`docs/**`, `README.md`) may be committed on
  `main` directly.
- Branch: `<label>/<issue>-<slug>` from the current `main`, one issue per branch; parallel work uses a git worktree.
- Before the push: rebase onto `main` and run the gate.
- PR title = its main commit subject (`commit-message-format`); the body names the issue, the decisions it records
  and the gate totals.
- The owner merges. After the merge the branch is deleted locally and remotely and its worktree removed.
- Deployable images are built only from commits on `main`.
