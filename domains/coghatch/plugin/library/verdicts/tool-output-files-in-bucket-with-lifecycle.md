---
type: verdicts
title: Tool output files in a lifecycle bucket
description: Tool output files go to a dedicated labelled bucket with a 30-day lifecycle and are served by name; a local directory backend exists for development behind an explicit env switch.
status: stable
tags: [mcp, storage]
source: tools-server 6
generated: { by: human:migrate, at: 2026-09-21T00:00:00Z }
---

Tool output files go to a dedicated labelled bucket with a 30-day lifecycle and are served by name; a local directory backend exists for development behind an explicit env switch.

## Why

Files outlive the turn but not forever; development never writes to the real bucket by accident.

## Context

Write tool outputs to a dedicated bucket with a 30-day lifecycle and cost labels, served at a files route by name. For development, a local directory backend is chosen only by an explicit env setting.

Reports and exports are the most valued output of the agents.
