---
name: size-limits-own-files-warnings-upstream
kind: verdicts
description: Size and complexity limits were errors on files wholly ours and warnings on upstream files, so upstream code never had to be rewritten.
status: superseded
tags: [agent-forge, quality, upstream-fork]
date: 2026-09-24
source: forge A11
---

# Size limits: errors on our files, warnings on upstream

## Context

The fork carries upstream files that exceed the team's lint size limits. Rewriting them would break tag merges.

## Decision

Files wholly ours get max-lines 500, max-lines-per-function 100, max-params 8, max-depth 6 and complexity 15 as errors. Upstream files get the same limits as warnings. Our additions in upstream files stay one-line hooks; the logic lives in our own files.

## Why

Keeps our code to the house standard without forking upstream style. Superseded: warnings were dropped and any warning now fails the gate.
