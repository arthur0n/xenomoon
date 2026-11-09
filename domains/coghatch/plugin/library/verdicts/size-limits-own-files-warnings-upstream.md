---
type: verdicts
title: Size limits: errors on our files, warnings on upstream
description: Size and complexity limits were errors on files wholly ours and warnings on upstream files, so upstream code never had to be rewritten.
status: deprecated
tags: [agent-forge, quality, upstream-fork]
source: forge A11
generated: { by: human:migrate, at: 2026-09-24T00:00:00Z }
---

Size and complexity limits were errors on files wholly ours and warnings on upstream files, so upstream code never had to be rewritten.

## Why

Keeps our code to the house standard without forking upstream style. Superseded: warnings were dropped and any warning now fails the gate.

## Context

Files wholly ours get max-lines 500, max-lines-per-function 100, max-params 8, max-depth 6 and complexity 15 as errors. Upstream files get the same limits as warnings. Our additions in upstream files stay one-line hooks; the logic lives in our own files.

The fork carries upstream files that exceed the team's lint size limits. Rewriting them would break tag merges.
