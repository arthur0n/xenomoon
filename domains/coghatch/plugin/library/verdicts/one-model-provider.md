---
name: one-model-provider
kind: verdicts
description: Use one model provider account and one secret for every agent and pipeline model call; model ids are config per call site, never literals in code.
status: amended
tags: [llm, secrets]
date: 2026-09-03
source: platform D7
---

# One model provider, one secret

## Context

Agents and some pipeline steps (for example rewriting a draft into a polite mail) call a language model.

## Decision

Use one provider (OpenAI) on one account with one API key secret, granted to each reader that needs it.
The model id is a config value per call site, never a literal in code; availability and price are
re-researched on the day a model is chosen. A prompt is the consumer's domain content: it lives in the repo
next to its adapter and is pinned by a test. The model key lives with the app, never on the workflow server.

## Why

- A second provider is a second secret and a second bill for no capability the cases need.
- Config-per-call-site lets one step move to a cheaper model without touching others.
