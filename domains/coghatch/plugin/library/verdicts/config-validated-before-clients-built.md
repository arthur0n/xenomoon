---
name: config-validated-before-clients-built
kind: verdicts
description: Every pure config check runs at boot before any client or backend is built, and each catalog entry must declare whether it reads tool defaults, so a stray or misspelled block is a boot error.
status: accepted
tags: [mcp, quality]
date: 2026-10-01
source: tools-server 10
---

# Validate config before building clients

## Context

A config block under a removed or misspelled tool was silently ignored, and a bad config built the cloud backend before refusing.

## Decision

Each catalog entry declares (type-required) whether it reads per-tool defaults. One validate step checks defaults keys, tool names, engine preconditions and stray blocks before any client exists; a failure names the tool. Subset builds repeat the per-tool checks.

## Why

A config mistake should stop the boot with a clear message, not hide.
