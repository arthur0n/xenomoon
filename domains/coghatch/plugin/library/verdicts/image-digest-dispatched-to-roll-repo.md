---
name: image-digest-dispatched-to-roll-repo
kind: verdicts
description: After a main build, a separate job sends the image digest to the deploy repo by repository_dispatch using a one-hour GitHub App token scoped to that repo, held in a main-only environment; the deploy repo opens a pin PR whose merge approves the roll.
status: accepted
tags: [ci, infra, auth]
date: 2026-10-09
source: tools-server 11a
---

# Image digest dispatched to the deploy repo

## Context

Digests reached the VM compose file only by hand-pasting from a run summary.

## Decision

The build job publishes the pushed digest as an output. A dispatch job needs it, holds no default token permission, and sends an image-built event with image, digest, source repo, commit and run link to the repo named in a variable. The credential is a GitHub App installed on that repo only; a token is minted per run with contents-write only. Key, client id and target live in an environment limited to main. Any missing input or non-204 answer fails the job. The receiver refuses an older commit than the one pinned and opens the pin PR.

## Why

An app token expires in an hour, acts as no person and reaches one repo; the merge is the human approval.
