---
type: verdicts
title: Agent turns keyed by the run id
description: One question is one agent turn, created once under keys taken from the workflow run id, so every retry of a run lands on the same session and the same turn and never creates a second one.
status: stable
amends: [agent-harness-serves-every-agent]
tags: [agent-forge, workflow-engine]
source: platform D33
generated: { by: human:migrate, at: 2026-10-09T00:00:00Z }
---

One question is one agent turn, created once under keys taken from the workflow run id, so every retry of a run lands on the same session and the same turn and never creates a second one.

## Why

- A run never makes a second session or turn, including when a create response is lost.

## Context

The session's external id is the thread id on a continuation and the run id on first contact; the turn's
external id is the run id. Two steps: `agent-turn` ensures the session and creates the turn, returning the
ticket; `agent` waits on it. A rerun from `agent-turn` gets new keys; a rerun from `agent` waits on the same
turn. The key rides in the editable step input; a replaced input that keeps the old key is refused by the
harness (409) and the adapter names the conflict. The adapter refuses a created turn whose external id is not
the key it sent, so a server without key support cannot silently duplicate.

A lost create response followed by a retry created duplicate turns. The run id is the same on every attempt
and new on a rerun.
