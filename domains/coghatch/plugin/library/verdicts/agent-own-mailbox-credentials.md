---
name: agent-own-mailbox-credentials
kind: verdicts
description: Each agent address was briefly its own mailbox with its own SMTP user and password, so an agent's mail went out as that agent.
status: superseded
tags: [email, secrets]
date: 2026-09-10
source: platform D21
---

# Every address its own mailbox (replaced)

## Context

The first live agent answer went out from the pipeline's shared sender address. Each agent should answer
as itself.

## Decision

Give each agent address its own mailbox: its own SMTP user and a password secret per mailbox, read at boot.
The shared SMTP user was never used for an agent.

## Why

- From and Reply-To must be the agent's own address.
- Replaced the next day: domain-level authorisation on a transactional API removed the need for any
  per-address credential.
