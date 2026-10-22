---
name: how-to-runbooks-kept-alive-by-use
kind: verdicts
description: Keep two short checklist runbooks, one for a new pipeline and one for a new agent address, and fix whatever a checklist got wrong in the same commit as the work that used it.
status: accepted
tags: [workflow-engine, agent-forge]
date: 2026-10-21
source: platform D41
---

# Two how-to runbooks, kept alive by use

## Context

The knowledge to add a pipeline or an agent address existed, but only inside long per-automation operator
docs; there was no page to start from.

## Decision

Two checklists: a new automation (folder, function, address key, conf, routing, roll, proof) and one more
mail-answering agent. Each is a checklist, not a history; per-automation runbooks keep the operator detail.
Every issue that follows one ends by fixing what the checklist got wrong or left out, in the same commit.

## Why

- Not perfect by design; improved on each use.
