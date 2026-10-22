---
name: ci-image-build-keyless-federation
kind: verdicts
description: CI builds and pushes images without a key — a workload identity federation provider maps the repo's OIDC token to an existing deployer service account, and the digest is a job output.
status: accepted
tags: [ci, auth, infra]
date: 2026-09-21
source: forge A2
---

# Keyless image builds in CI

## Context

CI must push images to the cloud registry. A downloaded service-account key would be a long-lived secret in the CI store.

## Decision

CI authenticates through workload identity federation to the existing deployer service account; no new service account and no key. The image is tagged by commit and its digest is published by the build job; the deploy pins that digest.

## Why

No long-lived key exists to leak, and reusing the existing deployer keeps the IAM surface small.
