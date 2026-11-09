---
type: verdicts
title: Pipeline-shaped agent addresses
description: An agent address whose function must act on the agent's answer (validate a closed JSON object, read the record back, format the reply) is its own pipeline; an address that only relays the agent's prose is the generic ask-agent function.
status: stable
amends: [agent-per-email-address]
tags: [agent-forge, workflow-engine, email]
source: platform D27
generated: { by: human:migrate, at: 2026-09-16T00:00:00Z }
---

An agent address whose function must act on the agent's answer (validate a closed JSON object, read the record back, format the reply) is its own pipeline; an address that only relays the agent's prose is the generic ask-agent function.

## Why

- Only a pipeline with a read-back step can tell the person what was really created.
- Accepted: an operator on the proxy allow-list can rerun a step with edited input and reach a real write
  without passing the mail gate; the proxy allow-list is the control.

## Context

Criterion: if the function must act on the answer, it is a pipeline of its own; if it only relays prose, it is
`ask-agent`. The agent still owns the write through its tools (resolve-then-create is one judgement), so the
pipeline has no write step: context → agent → parse → question, or read-back → confirmation, or alert. A
pipeline name carries the system it writes to. Proven by one real run on a record the owner names.

A write-capable agent needed a mail entry point, and its reply must state what the ERP actually holds.
