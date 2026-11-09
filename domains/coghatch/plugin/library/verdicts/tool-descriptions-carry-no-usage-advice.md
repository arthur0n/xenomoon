---
type: verdicts
title: Tool descriptions carry no usage advice
description: A tool's description says only what it does; 'which tool when' lives in the agent's prompt, and a test refuses advice phrases in descriptions.
status: stable
tags: [mcp, llm]
source: tools-server 14
generated: { by: human:migrate, at: 2026-10-19T00:00:00Z }
---

A tool's description says only what it does; 'which tool when' lives in the agent's prompt, and a test refuses advice phrases in descriptions.

## Why

Tools are shared by many agents; usage advice differs per agent.

## Context

Tool descriptions are short and factual. Guidance on when to use which tool belongs to the agent prompt. A description test refuses advice phrases. Errors are fixed, tool-named messages; an error body is never read or echoed.

A new search tool sat beside the provider's built-in search, and both could be described as 'use me for X'.
