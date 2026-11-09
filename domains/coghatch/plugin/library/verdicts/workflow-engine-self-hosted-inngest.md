---
type: verdicts
title: Self-hosted Inngest as the workflow engine
description: The automation layer is self-hosted Inngest, because it is the only finalist that lets an operator rerun a failed run from a step with edited input on a deployed flow.
status: stable
tags: [workflow-engine, infra]
source: platform D0
generated: { by: human:migrate, at: 2026-09-04T00:00:00Z }
---

The automation layer is self-hosted Inngest, because it is the only finalist that lets an operator rerun a failed run from a step with edited input on a deployed flow.

## Why

- Rerun-from-step with edited input is included; Windmill has it only in its paid Enterprise tier, n8n not at all.
- Small operating surface: one server, one database, one cache.
- The server licence (SSPL) converts each release to Apache-2.0 three years after release, so a pinned

## Context

Run Inngest self-hosted: one server container plus Postgres plus Redis. Pipeline logic lives in git as
TypeScript. The `inngest` SDK is an allowed runtime dependency because it is the server the platform runs,
not an external-system SDK.

Escape route: if Inngest is dropped, the pipeline logic stays (plain exported functions with their own
tests, kept outside the `*.inngest.ts` wiring files), events stay plain JSON, run history stays exportable
from Postgres, and the auth proxy and VM import nothing from Inngest. Only the orchestration layer (steps,
retries, sleep, wait-for-event, dashboard) is swapped for Temporal, Hatchet, Trigger.dev or Restate.

The platform needed an automation layer for email-triggered pipelines run by technical operators only.
Finalists were n8n, Windmill and Inngest; Trigger.dev, Temporal, Restate, Hatchet, Google Workflows and
Mastra were researched and dropped. A visual canvas was ruled out: no human-in-the-loop, diagrams only.
and mirrored version becomes permissive on its own.

- Re-open if staff must compose flows visually, or if the single-node server fails its first verification.
