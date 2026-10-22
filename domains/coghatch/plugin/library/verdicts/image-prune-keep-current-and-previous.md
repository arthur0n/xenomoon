---
name: image-prune-keep-current-and-previous
kind: verdicts
description: After every successful start the VM keeps only images named in the current and previous compose files and removes all others, off the restart's critical path.
status: accepted
amends: [nightly-backups-postgres-redis]
tags: [infra]
date: 2026-09-24
source: platform D28
---

# Prune images to current and previous release

## Context

The VM disk reached 83 % with 64 images: every deploy pulled new digests and nothing removed old ones.

## Decision

After each successful start (`ExecStartPost=-`, so a prune bug never keeps the stack down), keep every image
whose digest is named in the installed compose file (including images that are pulled but not services) or in
the one it replaced, and remove every other image.

## Why

- The current release and the rollback target stay; nothing older is needed on the host.
- The registry still holds the last ten deploys for older rollbacks.
