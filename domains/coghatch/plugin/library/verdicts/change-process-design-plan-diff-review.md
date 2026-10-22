---
name: change-process-design-plan-diff-review
kind: verdicts
description: A change runs as — issue with design, adversarial design review, small-step plan with review, one build dispatch with code, tests and docs together, one adversarial diff review, then the owner commits and one live run is the proof.
status: accepted
tags: [process, quality]
date: 2026-08-25
source: warehouse convention
---

# Change process: design, plan, build, review, prove

## Context

Per-step reviews found nothing; the design and the final diff reviews found everything.

## Decision

1. The issue is a tiny spec and design with exact files. 2) Adversarial review of the design. 3) A plan in small steps only where risk differs, reviewed. 4) One dispatch writes code, tests and docs, gated by validate. 5) One adversarial review of the full diff. 6) The owner commits and pushes, CI deploys, one live run proves it, the issue closes with commit and execution ids.

## Why

Reviews where they find things; one live run as the proof.
