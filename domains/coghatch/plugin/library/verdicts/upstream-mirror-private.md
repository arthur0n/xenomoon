---
name: upstream-mirror-private
kind: verdicts
description: An exact private mirror of the upstream harness repo holds every upstream branch and tag, is never edited, and is refreshed and verified by ref ids.
status: accepted
tags: [agent-forge, upstream-fork, ci]
date: 2026-09-21
source: forge D5
---

# Private mirror of the upstream repo

## Context

The fork merges upstream tags. Fetching straight from the public repo leaves no copy if upstream disappears or rewrites history.

## Decision

Keep an exact private copy of the upstream repo (all branches and tags). It is made private before the first push, never edited, has no branch of ours, and a scheduled workflow refreshes it and checks every ref id against upstream.

## Why

The mirror is the escape route: with every upstream ref held, the fork survives a deleted or relicensed upstream.
