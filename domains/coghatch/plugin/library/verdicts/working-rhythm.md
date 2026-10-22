---
name: working-rhythm
kind: verdicts
description: Change work runs one step per turn and stops for the owner's reply; a subagent gets exactly one step with an allow-list and a do-not-touch list; at most two subagents at once, one builder and one reviewer.
status: accepted
tags: [convention, process, agents]
date: 2026-09-03
---

# Working rhythm — one step per turn

## Context

The "working rhythm" section was copied into every repo's conventions file.

## Decision

- The change workflow is interactive, never one-shot: the main agent runs one step and stops; the next step starts
  on the owner's reply.
- A subagent gets exactly one step, with an explicit allow-list and a do-not-touch list, and reports back.
- At most two subagents at a time: one builder, one reviewer.
- Infra steps follow `infra-mutation-one-approved-command`.

## Why

Small, reviewed steps keep a wrong turn cheap to undo.
