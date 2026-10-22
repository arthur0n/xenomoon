---
name: images-built-in-ci-pinned-by-digest
kind: verdicts
description: CI builds every image and pushes it to Artifact Registry; deployments name images by sha256 digest, never a tag, and vendor images are mirrored by digest, so no build credential lives on the VM.
status: amended
tags: [ci, infra, security]
date: 2026-09-04
source: platform D13
---

# CI builds images; deploys pin digests

## Context

Building on the VM would need a registry token on the host for the private connections package, the standing
credential the single-VM design keeps off it.

## Decision

CI builds the app, proxy and receiver images and pushes them as `sha-<commit>`. The compose file names every
image by `@sha256:` digest; the Cloud Run receiver is deployed from its digest. Vendor images are copied by
digest into an immutable-tag mirror registry that holds only what is pinned. Every deploy is a commit. CI
authenticates by workload identity federation (main branch only, writer role, no key); pull-request runs get
a separate read-only identity.

## Why

- CI's token lives in an ephemeral runner as a build secret.
- A digest is what actually runs; a tag can move.
- Pulls go over Private Google Access.
