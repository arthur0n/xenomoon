---
type: verdicts
title: Tag pipeline sessions and hide them in the UI
description: Every session a pipeline creates carries a source tag, and the chat UI hides those sessions from the history list; this hides, it does not protect.
status: stable
tags: [agent-forge, ui]
source: forge A26
generated: { by: human:migrate, at: 2026-09-26T00:00:00Z }
---

Every session a pipeline creates carries a source tag, and the chat UI hides those sessions from the history list; this hides, it does not protect.

## Why

Cheap UI hygiene. Access control is a separate question answered by login.

## Context

Pipelines write a source=pipeline metadata tag on each session; the chat UI drops tagged sessions from the history list. The sessions API still returns them.

Pipeline sessions would crowd the history list of the single pilot subject.
