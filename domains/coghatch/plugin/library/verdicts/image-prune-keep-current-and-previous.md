---
type: verdicts
title: Prune images to current and previous release
description: After every successful start the VM keeps only images named in the current and previous compose files and removes all others, off the restart's critical path.
status: stable
amends: [nightly-backups-postgres-redis]
tags: [infra]
source: platform D28
generated: { by: human:migrate, at: 2026-09-24T00:00:00Z }
---

After every successful start the VM keeps only images named in the current and previous compose files and removes all others, off the restart's critical path.

## Why

- The current release and the rollback target stay; nothing older is needed on the host.
- The registry still holds the last ten deploys for older rollbacks.

## Context

After each successful start (`ExecStartPost=-`, so a prune bug never keeps the stack down), keep every image
whose digest is named in the installed compose file (including images that are pulled but not services) or in
the one it replaced, and remove every other image.

The VM disk reached 83 % with 64 images: every deploy pulled new digests and nothing removed old ones.
