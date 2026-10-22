---
name: chat-ui-hides-unused-schedules
kind: verdicts
description: The chat UI offers no schedules surface to anyone while no one uses it; the server API is unchanged.
status: accepted
tags: [agent-forge, ui]
date: 2026-10-14
source: forge A51
---

# Hide unused schedules from the UI

## Context

No staff used scheduled runs, and the feature raised access questions nobody needed answered yet.

## Decision

The frontend mounts the UI server without its schedules port, so no button, route or tab appears. The API stays: create follows agent policy, update and delete stay creator-only.

## Why

A surface nobody uses is risk without value; hiding it changes no upstream code.
