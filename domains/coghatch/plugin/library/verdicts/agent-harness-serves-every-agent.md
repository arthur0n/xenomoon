---
name: agent-harness-serves-every-agent
kind: verdicts
description: One agent harness serves every agent; a single Agent adapter is composed over the harness caller contract, and which saved agent serves which address is a code table, never env.
status: amended
supersedes: [agent-layer-existing-service-not-agentkit]
tags: [agent-forge, workflow-engine]
date: 2026-09-29
source: platform D33
---

# The agent harness serves every agent

## Context

Agents were spread over an earlier agent service. A forked agent harness (based on the upstream TrueForge)
now hosts saved agents by name.

## Decision

Every agent (mail-answering and pipeline-called) is served by the agent harness through one adapter over the
harness caller contract; adapters never import each other. A code table maps each agent to its saved agent
name; the harness loads saved agents by that name from its image, so a rename is a diff on both sides, never
an operator knob that could point a mail agent at an agent with write tools. A file the agent produces
reaches the user only as a URL in its answer. The earlier service, its keys and its adapter were deleted;
its repo was kept briefly as the rollback source.

## Why

- One runtime, one adapter, one auth path for every agent.
