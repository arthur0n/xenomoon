---
name: model-vendors-as-connections
kind: verdicts
description: Each model vendor is its own folder in the connections package with its own auth and endpoints, no vendor SDK and no shared abstraction across vendors; pipelines call it directly.
status: accepted
amends: [one-model-provider]
tags: [llm, connections, deps]
date: 2026-09-11
source: platform D22
---

# Model vendors are connections

## Context

A pipeline step (a text rewriter) needed a model call outside any agent runtime.

## Decision

The connections package gets an `openai/` folder: core (API-key bearer, the shared retry and typed error) and
one service per endpoint family, one file per method; first a text-in, text-out responses call. A later
vendor is its own folder with its own auth and contract. No vendor SDK, no runtime dependency. Root bloat
rule: system folders stay flat until a second vendor of the same category arrives; then nesting by category
is reviewed, keeping the export path stable.

## Why

- A cross-vendor abstraction would be designed from one example.
- The agent runtime keeps its own AI SDK; an agent tool over a connection is a separate decision.
