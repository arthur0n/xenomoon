---
name: agent-turn-keyed-by-run-id
kind: verdicts
description: One question is one agent turn, created once under keys taken from the workflow run id, so every retry of a run lands on the same session and the same turn and never creates a second one.
status: accepted
amends: [agent-harness-serves-every-agent]
tags: [agent-forge, workflow-engine]
date: 2026-10-09
source: platform D33
---

# Agent turns keyed by the run id

## Context

A lost create response followed by a retry created duplicate turns. The run id is the same on every attempt
and new on a rerun.

## Decision

The session's external id is the thread id on a continuation and the run id on first contact; the turn's
external id is the run id. Two steps: `agent-turn` ensures the session and creates the turn, returning the
ticket; `agent` waits on it. A rerun from `agent-turn` gets new keys; a rerun from `agent` waits on the same
turn. The key rides in the editable step input; a replaced input that keeps the old key is refused by the
harness (409) and the adapter names the conflict. The adapter refuses a created turn whose external id is not
the key it sent, so a server without key support cannot silently duplicate.

## Why

- A run never makes a second session or turn, including when a create response is lost.
