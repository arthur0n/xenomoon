---
name: pipeline-sessions-tagged-and-hidden
kind: verdicts
description: Every session a pipeline creates carries a source tag, and the chat UI hides those sessions from the history list; this hides, it does not protect.
status: amended
tags: [agent-forge, ui]
date: 2026-09-26
source: forge A26
---

# Tag pipeline sessions and hide them in the UI

## Context

Pipeline sessions would crowd the history list of the single pilot subject.

## Decision

Pipelines write a source=pipeline metadata tag on each session; the chat UI drops tagged sessions from the history list. The sessions API still returns them.

## Why

Cheap UI hygiene. Access control is a separate question answered by login.
