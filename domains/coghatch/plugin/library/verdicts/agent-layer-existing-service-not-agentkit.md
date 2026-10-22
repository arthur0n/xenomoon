---
name: agent-layer-existing-service-not-agentkit
kind: verdicts
description: Pipelines first called an existing private agent service synchronously, one workflow step per call, rather than adopting AgentKit, because the agents were fixed procedures with a closed JSON contract.
status: superseded
tags: [agent-forge, workflow-engine, llm]
date: 2026-09-03
source: platform D11
---

# Agent layer: the existing agent service, not AgentKit (replaced)

## Context

The pipelines needed agents. An agent service was already deployed, and Inngest offers AgentKit.

## Decision

A pipeline step calls the existing agent service (private Cloud Run, Google ID token, invoker role for the
pipelines' service account only). Transport: synchronous, one step per agent call; the configured URL is used
verbatim and the token audience is the service base URL; the call timeout stays below the service's request
timeout. The reply is a generic `{ thread, text }`; an agent with a closed JSON contract has the schema sent
by the caller and the reply validated by the step. Not AgentKit.

## Why

- The agents were fixed procedures with a closed contract, not agent networks.
- AgentKit would add a second runtime, and its npm release lagged its repo.
- Replaced when one agent harness took over every agent (see the superseding record).
