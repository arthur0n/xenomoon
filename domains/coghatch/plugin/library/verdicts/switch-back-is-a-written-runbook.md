---
name: switch-back-is-a-written-runbook
kind: verdicts
description: Switch-back is a one-page runbook per agent naming the settings to restore, applied by hand; it is neither a gate nor automatic, and each switch has its own issue.
status: accepted
supersedes: [migration-switches-forward-only]
amends: [migration-switches-one-agent-at-a-time]
tags: [agent-forge, migration]
date: 2026-09-29
source: forge A35
---

# Switch-back is a written runbook

## Context

Both runtimes were live. The owner wanted to cut one agent over when tested and change it back by hand if something went wrong.

## Decision

One agent at a time stays. One page per agent (and for any single-upstream caller that must switch all at once) names the settings that go back and the roll. The old runtime stays deployed and untouched until the last switch has run clean. No rehearsal, no gate. A caller with only one upstream switches once, with the first agent, after its access grants are reviewed.

## Why

A cheap way back without a rehearsal cost.
