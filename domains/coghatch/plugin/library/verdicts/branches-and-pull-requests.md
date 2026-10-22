---
name: branches-and-pull-requests
kind: verdicts
description: Code reaches main only through a pull request from a `<label>/<issue>-<slug>` branch rebased and gated before the push; docs-only changes may go straight to main.
status: accepted
tags: [convention, git]
date: 2026-09-26
---

# Branches and pull requests

## Decision

- Code reaches `main` only through a pull request. Docs-only changes (`docs/**`, `README.md`) may be committed on
  `main` directly.
- Branch: `<label>/<issue>-<slug>` from the current `main`, one issue per branch; parallel work uses a git worktree.
- Before the push: rebase onto `main` and run the gate.
- PR title = its main commit subject (`commit-message-format`); the body names the issue, the decisions it records
  and the gate totals.
- The owner merges. After the merge the branch is deleted locally and remotely and its worktree removed.
- Deployable images are built only from commits on `main`.

## Why

Review happens once, on a branch that already passes the gate.
