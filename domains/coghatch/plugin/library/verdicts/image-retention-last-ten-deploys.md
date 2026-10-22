---
name: image-retention-last-ten-deploys
kind: verdicts
description: The image registry keeps the images of the last 10 deploys via keep-tags derived from git history on main, and deletes every other version older than 7 days.
status: accepted
amends: [images-built-in-ci-pinned-by-digest]
tags: [ci, infra]
date: 2026-09-24
source: platform D13
---

# Keep the last ten deployed images

## Context

Artifact Registry's own "most recent versions" rule counts pushes, so ten undeployed pushes would delete the
image that is running.

## Decision

A CI job reads the deploy files' git history and points two banks of tags (`keep-a-1..10`, `keep-b-1..10`)
at the last 10 distinct digests on `main`; one bank is always whole, so an interrupted run unprotects nothing.
A roll waits for that job. The cleanup policy keeps every `keep-*` version and deletes every other version
older than 7 days, untagged included.

## Why

- Deriving the set from git makes every run a full reconcile; a skipped run is repaired by the next.
- It needs only tag create/update, which the writer role grants (it does not grant tag delete).
- Accepted risk: a failed reconcile run is an incident handled when it happens.
