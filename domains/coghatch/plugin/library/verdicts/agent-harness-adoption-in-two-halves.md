---
name: agent-harness-adoption-in-two-halves
kind: verdicts
description: The forked agent harness was adopted in two halves — first build and prove it beside the old runtime with no caller touched, then decide the cutover on the pilot proof.
status: amended
tags: [agent-forge, migration]
date: 2026-09-21
source: forge D0
---

# Adopt the agent harness in two halves

## Context

An in-house agent runtime was being replaced by a fork of the upstream agent harness. Callers (pipelines, the access hub) depended on the old runtime every day.

## Decision

Go, in two halves. Half 1 builds the repos, the MCP tools server, the sandbox and the VM deploy, and loads the agents by script, with no caller touched; the old runtime keeps running in parallel. Half 2 (re-pointing callers, retiring the old runtime) is decided only after a written pilot proof.

## Why

Nothing in production depends on the new harness until it has answered real questions. The pilot proof turns the cutover into a decision on evidence, not a plan.
