---
type: verdicts
title: Adopt the agent harness in two halves
description: The forked agent harness was adopted in two halves — first build and prove it beside the old runtime with no caller touched, then decide the cutover on the pilot proof.
status: stable
tags: [agent-forge, migration]
source: forge D0
generated: { by: human:migrate, at: 2026-09-21T00:00:00Z }
---

The forked agent harness was adopted in two halves — first build and prove it beside the old runtime with no caller touched, then decide the cutover on the pilot proof.

## Why

Nothing in production depends on the new harness until it has answered real questions. The pilot proof turns the cutover into a decision on evidence, not a plan.

## Context

Go, in two halves. Half 1 builds the repos, the MCP tools server, the sandbox and the VM deploy, and loads the agents by script, with no caller touched; the old runtime keeps running in parallel. Half 2 (re-pointing callers, retiring the old runtime) is decided only after a written pilot proof.

An in-house agent runtime was being replaced by a fork of the upstream agent harness. Callers (pipelines, the access hub) depended on the old runtime every day.
