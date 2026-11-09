---
type: verdicts
title: Hide unused schedules from the UI
description: The chat UI offers no schedules surface to anyone while no one uses it; the server API is unchanged.
status: stable
tags: [agent-forge, ui]
source: forge A51
generated: { by: human:migrate, at: 2026-10-14T00:00:00Z }
---

The chat UI offers no schedules surface to anyone while no one uses it; the server API is unchanged.

## Why

A surface nobody uses is risk without value; hiding it changes no upstream code.

## Context

The frontend mounts the UI server without its schedules port, so no button, route or tab appears. The API stays: create follows agent policy, update and delete stay creator-only.

No staff used scheduled runs, and the feature raised access questions nobody needed answered yet.
