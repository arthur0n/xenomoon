---
name: mirror-refresh-failure-opens-issue
kind: verdicts
description: A failed or cancelled upstream-mirror refresh opens one issue (or comments on the open one) using a job-scoped token with issues-write only.
status: accepted
tags: [ci, observability, upstream-fork]
date: 2026-09-26
source: forge A20
---

# A failed mirror refresh opens an issue

## Context

Scheduled mirror refreshes failed silently for days because the push token lacked the workflow scope.

## Decision

The mirror token carries contents and workflows write on the mirror repo only. The refresh workflow's last step runs on failure or cancel and opens an issue with a fixed title and label, or comments on the open one. Workflow default permissions are empty; only that job gets issues-write. Every step has a timeout inside the job's budget.

## Why

A refresh that fails must be seen; a job timeout counts as a cancel, so it is covered too.
