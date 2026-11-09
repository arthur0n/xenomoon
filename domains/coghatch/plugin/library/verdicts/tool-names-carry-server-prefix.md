---
type: verdicts
title: Tool names carry the server prefix
description: Every tool name carries its server's short prefix, follows <prefix><verb>_<object>, is unique across servers and at most 64 characters, checked by one rule module at boot and in the gate.
status: stable
tags: [mcp, quality]
source: tools-server 16
generated: { by: human:migrate, at: 2026-10-13T00:00:00Z }
---

Every tool name carries its server's short prefix, follows <prefix><verb>\_<object>, is unique across servers and at most 64 characters, checked by one rule module at boot and in the gate.

## Why

A collision becomes impossible and a wrong name becomes a red commit.

## Context

A prefix of 2-3 lowercase letters plus underscore belongs to exactly one server; names are snake_case and at most 64 characters. One module holds the rule and is used both at boot and by a gate script.

The harness silently renames a duplicate tool name across connectors and truncates names to 64 characters; either breaks an agent's enabled-tools list without an error.
