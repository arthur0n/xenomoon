---
name: pipeline-identity-is-service-name
kind: verdicts
description: A pipeline identifies itself with one fixed service name per pipeline, not with the mailbox that triggered the run; the sender stays in the pipeline's own run record.
status: amended
amends: [tool-identity-is-attribution-until-login]
tags: [agent-forge, auth, workflow-engine]
date: 2026-09-30
source: forge A36
---

# A pipeline's identity is its service name

## Context

Pipelines are triggered by mail. A sender address is a string the pipeline cannot verify.

## Decision

Each pipeline writes one fixed user name naming itself in the session it creates (in the same get-or-create request). The harness refuses an existing session whose stored user differs. The triggering mailbox stays in the pipeline's run record.

## Why

Per-mailbox attribution would trust an unverified sender string.
