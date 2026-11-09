---
type: verdicts
title: Two how-to runbooks, kept alive by use
description: Keep two short checklist runbooks, one for a new pipeline and one for a new agent address, and fix whatever a checklist got wrong in the same commit as the work that used it.
status: stable
tags: [workflow-engine, agent-forge]
source: platform D41
generated: { by: human:migrate, at: 2026-10-21T00:00:00Z }
---

Keep two short checklist runbooks, one for a new pipeline and one for a new agent address, and fix whatever a checklist got wrong in the same commit as the work that used it.

## Why

- Not perfect by design; improved on each use.

## Context

Two checklists: a new automation (folder, function, address key, conf, routing, roll, proof) and one more
mail-answering agent. Each is a checklist, not a history; per-automation runbooks keep the operator detail.
Every issue that follows one ends by fixing what the checklist got wrong or left out, in the same commit.

The knowledge to add a pipeline or an agent address existed, but only inside long per-automation operator
docs; there was no page to start from.
