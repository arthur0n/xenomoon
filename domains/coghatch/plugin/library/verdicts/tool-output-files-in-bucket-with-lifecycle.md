---
name: tool-output-files-in-bucket-with-lifecycle
kind: verdicts
description: Tool output files go to a dedicated labelled bucket with a 30-day lifecycle and are served by name; a local directory backend exists for development behind an explicit env switch.
status: accepted
tags: [mcp, storage]
date: 2026-09-21
source: tools-server 6
---

# Tool output files in a lifecycle bucket

## Context

Reports and exports are the most valued output of the agents.

## Decision

Write tool outputs to a dedicated bucket with a 30-day lifecycle and cost labels, served at a files route by name. For development, a local directory backend is chosen only by an explicit env setting.

## Why

Files outlive the turn but not forever; development never writes to the real bucket by accident.
