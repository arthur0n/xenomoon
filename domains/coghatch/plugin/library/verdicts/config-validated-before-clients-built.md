---
type: verdicts
title: Validate config before building clients
description: Every pure config check runs at boot before any client or backend is built, and each catalog entry must declare whether it reads tool defaults, so a stray or misspelled block is a boot error.
status: stable
tags: [mcp, quality]
source: tools-server 10
generated: { by: human:migrate, at: 2026-10-01T00:00:00Z }
---

Every pure config check runs at boot before any client or backend is built, and each catalog entry must declare whether it reads tool defaults, so a stray or misspelled block is a boot error.

## Why

A config mistake should stop the boot with a clear message, not hide.

## Context

Each catalog entry declares (type-required) whether it reads per-tool defaults. One validate step checks defaults keys, tool names, engine preconditions and stray blocks before any client exists; a failure names the tool. Subset builds repeat the per-tool checks.

A config block under a removed or misspelled tool was silently ignored, and a bad config built the cloud backend before refusing.
