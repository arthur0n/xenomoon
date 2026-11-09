---
type: verdicts
title: Keyless image builds in CI
description: CI builds and pushes images without a key — a workload identity federation provider maps the repo's OIDC token to an existing deployer service account, and the digest is a job output.
status: stable
tags: [ci, auth, infra]
source: forge A2
generated: { by: human:migrate, at: 2026-09-21T00:00:00Z }
---

CI builds and pushes images without a key — a workload identity federation provider maps the repo's OIDC token to an existing deployer service account, and the digest is a job output.

## Why

No long-lived key exists to leak, and reusing the existing deployer keeps the IAM surface small.

## Context

CI authenticates through workload identity federation to the existing deployer service account; no new service account and no key. The image is tagged by commit and its digest is published by the build job; the deploy pins that digest.

CI must push images to the cloud registry. A downloaded service-account key would be a long-lived secret in the CI store.
