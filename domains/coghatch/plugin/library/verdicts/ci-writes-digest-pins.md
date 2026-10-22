---
name: ci-writes-digest-pins
kind: verdicts
description: A digest pin is written by CI as a pull request, and the owner's merge of that pin PR is the one approval of a roll; the pin workflow trusts nothing in the dispatch payload beyond what it verifies against the registry and the source run.
status: accepted
amends: [images-built-in-ci-pinned-by-digest]
tags: [ci, security, infra]
date: 2026-10-09
source: platform D37
---

# CI writes pins; merging the pin PR approves the roll

## Context

Digests reached the deploy file only by hand-pasting from job summaries, and pins lagged behind builds.

## Decision

(1) Each image is rebuilt only when a file its Dockerfile copies (or the CI file) changed, so a merged pin
never triggers a build. (2) After a main build, each source repo sends a `repository_dispatch` with image,
digest, source repo, commit and run URL, using a GitHub App token (one-hour, key in a main-only environment).
(3) The pin workflow checks a fixed image → repo → locations table, requires the registry tag for that commit
to resolve to the digest, the run to be a push or manual run on main at that commit, and the commit to be
newer than what is pinned; it rewrites every location and opens or updates one PR per image. (4) Every PR
checks digest shape and existence. (5) Main requires a PR with one approval; admins may bypass.

## Why

- The pin commit is where "what is rolled" is decided, so it is where approval sits.
- An App over a personal token: per-run token, acts as no person; a PR made with the default token would need
  manual CI approval.
