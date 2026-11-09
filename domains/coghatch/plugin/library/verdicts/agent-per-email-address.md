---
type: verdicts
title: Every agent has its own address
description: Every agent gets its own email address served by one generic ask-agent function per agent; an email-triggered agent never lives inside another pipeline, and the agent contract stays trigger-neutral.
status: stable
tags: [agent-forge, email, workflow-engine]
source: platform D21
generated: { by: human:migrate, at: 2026-09-10T00:00:00Z }
---

Every agent gets its own email address served by one generic ask-agent function per agent; an email-triggered agent never lives inside another pipeline, and the agent contract stays trigger-neutral.

## Why

- "NEVER" a branch inside another pipeline: no classifier exists, and it would couple two agents in one function.
- Every piece copies a pattern already live and adds no dependency.

## Context

Each agent has an address; mail to it is routed by `to`, sent to the agent, and answered with the thread
marker, From = Reply-To = the agent's address. One generic `ask-agent` pipeline, one workflow function per
agent; a new agent is one more name in an explicit code list plus its config keys (no env scanning). A fixed
email instruction is prefixed to every question (plain prose, no markdown) as pipeline logic. A mail to one
agent is never forwarded to another; agents orchestrate each other directly. Nothing email-specific enters the
agent contract or adapter, so agent-by-agent and agent-by-API triggers can reuse them later. Refusals of the
payload are non-retriable before any step; transport errors stay retriable inside their step.

Users wanted to talk to agents by mail. One option was a classifier branch inside an existing pipeline.
