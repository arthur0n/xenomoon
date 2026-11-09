---
type: verdicts
title: Every address its own mailbox (replaced)
description: Each agent address was briefly its own mailbox with its own SMTP user and password, so an agent's mail went out as that agent.
status: deprecated
tags: [email, secrets]
source: platform D21
generated: { by: human:migrate, at: 2026-09-10T00:00:00Z }
---

Each agent address was briefly its own mailbox with its own SMTP user and password, so an agent's mail went out as that agent.

## Why

- From and Reply-To must be the agent's own address.
- Replaced the next day: domain-level authorisation on a transactional API removed the need for any
  per-address credential.

## Context

Give each agent address its own mailbox: its own SMTP user and a password secret per mailbox, read at boot.
The shared SMTP user was never used for an agent.

The first live agent answer went out from the pipeline's shared sender address. Each agent should answer
as itself.
