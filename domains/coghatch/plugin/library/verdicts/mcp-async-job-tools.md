---
name: mcp-async-job-tools
kind: verdicts
description: Long agent runs are served as async MCP tools (ask returns a job handle, get_result redeems it), with every handle random and bound server-side to the caller's verified user id.
status: accepted
tags: [mcp, llm, security]
date: 2026-09-03
source: hub M6
---

# Async MCP tools for long agent runs

## Context

Agent runs routinely take longer than a minute; that is the common case. An earlier draft justified the
split by a "~60 second ChatGPT tool timeout" for which no first-party source exists, so that number is
not load-bearing.

## Decision

- `ask_<agent>` returns `{job}` at once; `get_result_<agent>` redeems it; `continue_<agent>` (thread plus
  question) follows the same contract.
- Jobs live in a store, with progress notifications while they run.
- Every job handle is generated with a CSPRNG and bound server-side to the user id taken from the verified
  token, and to the agent that created it. Owning a handle is never authentication; a foreign handle gets
  the same answer as one nobody minted.
- The conversation (thread) handle is minted by the agent app, not by the access hub; the access hub only
  stores and bounds it, and the agent app binds it to its user.

## Why

The design rests on the workload, not on an unsourced client timeout. Binding handles to the token's user
follows MCP's best practice on state-handle hijacking.

Not adopted: the official MCP Tasks extension, the standard form of this pattern, because no listed client
supports it yet. Re-open when ChatGPT lists Tasks.
