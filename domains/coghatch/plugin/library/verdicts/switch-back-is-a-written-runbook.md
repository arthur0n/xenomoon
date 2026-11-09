---
type: verdicts
title: Switch-back is a written runbook
description: Switch-back is a one-page runbook per agent naming the settings to restore, applied by hand; it is neither a gate nor automatic, and each switch has its own issue.
status: stable
supersedes: [migration-switches-forward-only]
amends: [migration-switches-one-agent-at-a-time]
tags: [agent-forge, migration]
source: forge A35
generated: { by: human:migrate, at: 2026-09-29T00:00:00Z }
---

Switch-back is a one-page runbook per agent naming the settings to restore, applied by hand; it is neither a gate nor automatic, and each switch has its own issue.

## Why

A cheap way back without a rehearsal cost.

## Context

One agent at a time stays. One page per agent (and for any single-upstream caller that must switch all at once) names the settings that go back and the roll. The old runtime stays deployed and untouched until the last switch has run clean. No rehearsal, no gate. A caller with only one upstream switches once, with the first agent, after its access grants are reviewed.

Both runtimes were live. The owner wanted to cut one agent over when tested and change it back by hand if something went wrong.
