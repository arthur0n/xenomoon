---
type: verdicts
title: A pipeline's identity is its service name
description: A pipeline identifies itself with one fixed service name per pipeline, not with the mailbox that triggered the run; the sender stays in the pipeline's own run record.
status: stable
amends: [tool-identity-is-attribution-until-login]
tags: [agent-forge, auth, workflow-engine]
source: forge A36
generated: { by: human:migrate, at: 2026-09-30T00:00:00Z }
---

A pipeline identifies itself with one fixed service name per pipeline, not with the mailbox that triggered the run; the sender stays in the pipeline's own run record.

## Why

Per-mailbox attribution would trust an unverified sender string.

## Context

Each pipeline writes one fixed user name naming itself in the session it creates (in the same get-or-create request). The harness refuses an existing session whose stored user differs. The triggering mailbox stays in the pipeline's run record.

Pipelines are triggered by mail. A sender address is a string the pipeline cannot verify.
