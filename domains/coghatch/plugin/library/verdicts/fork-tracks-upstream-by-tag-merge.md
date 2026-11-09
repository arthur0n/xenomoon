---
type: verdicts
title: Fork tracks upstream by merging release tags
description: The agent harness fork starts from one released upstream tag and takes upstream changes only by merging a newer tag, never by cherry-picking from upstream main.
status: stable
tags: [agent-forge, upstream-fork]
source: forge D2
generated: { by: human:migrate, at: 2026-09-21T00:00:00Z }
---

The agent harness fork starts from one released upstream tag and takes upstream changes only by merging a newer tag, never by cherry-picking from upstream main.

## Why

Tags are tested release points. One merge path keeps the fork's own diff readable and gives an exit route if upstream stops or relicenses.

## Context

The fork is seeded from one upstream release tag (history replaced by the tag, our docs on top). Upstream changes enter main only by merging a newer tag; conflicts are resolved on main and the convention gate re-runs after every tag merge. Any single upstream PR taken early is recorded with its upstream commit so a later tag that contains it is recognised. The diff against the base tag is the complete list of our changes.

The fork must keep taking upstream fixes without losing its own changes or re-applying the same patch twice.
