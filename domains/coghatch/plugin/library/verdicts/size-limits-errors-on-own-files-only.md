---
type: verdicts
title: Size limits: errors on our files, none on upstream
description: Size and complexity limits are errors on every code file added since the base tag, in every lint config, with no comment able to lift them; upstream files get no size rule, and any lint warning fails the gate.
status: stable
supersedes: [size-limits-own-files-warnings-upstream]
tags: [agent-forge, quality, upstream-fork]
source: forge A44
generated: { by: human:migrate, at: 2026-10-06T00:00:00Z }
---

Size and complexity limits are errors on every code file added since the base tag, in every lint config, with no comment able to lift them; upstream files get no size rule, and any lint warning fails the gate.

## Why

A warning nobody fixes is noise; an error on our code and silence on theirs is a rule that holds.

## Context

'Wholly ours' means added since the base tag. Those files, source and tests, get max-lines 500, max-lines-per-function 100, max-params 8, max-depth 6 and complexity 15 as errors, with inline config disabled and warning comments refused. Upstream files, including those carrying a hook of ours, get no size rule. Any lint warning fails the gate. A script checks that the list of our files is complete.

The warning tier on upstream files produced noise no one acted on, and new files of ours could slip outside the limit list.
