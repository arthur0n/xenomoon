---
name: mcp-tool-contracts
kind: verdicts
description: Each MCP tool is a curated contract — snake_case verb_object name, a description of at most three sentences, a flat required-only input with no model-chosen enum, a small fixed output, and every limit from config.
status: accepted
tags: [convention, mcp, agents]
date: 2026-09-11
---

# MCP tool contracts

## Decision

1. **Name:** `snake_case` verb_object, one purpose (`ask_agent`, `get_result`, `read_file`).
2. **Description:** what it does, what comes back, one hard limit; at most three sentences. No usage advice, no data
   schema. One sentence of sequencing (what to do with what comes back) is allowed; never _when_ to pick it over
   another tool — that is client material.
3. **Input schema:** flat, required fields only, no enum the model must choose between — a different choice is a
   different tool.
4. **Output schema:** fixed and small — job handles, previews, file names, never bulk data.
5. **Limits** (poll interval, timeout, page size) come from config with a reason or an UNVERIFIED label
   (`no-invented-numbers`).

A tool that needs an option is two tools.

## Why

The calling model should never have to reason about how a tool works, only whether to call it.
