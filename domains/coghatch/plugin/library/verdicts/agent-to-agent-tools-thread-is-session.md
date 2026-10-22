---
name: agent-to-agent-tools-thread-is-session
kind: verdicts
description: Agent-to-agent calls are ask/continue MCP tools over the harness's sessions API — the thread is the session id, the whole call runs under one deadline, a transport error on a status read does not end the wait, and errors name the thread.
status: accepted
tags: [mcp, agent-forge]
date: 2026-09-21
source: tools-server 7
---

# Agent-to-agent tools: thread is the session

## Context

Upstream subagents are invented per call; we needed saved agents that keep a thread across calls.

## Decision

Each agent gets ask and continue tools. Ask opens a session, posts a non-streaming turn and polls it to a terminal state; continue reuses the session id as the thread. One abort signal covers the token wait, every request, body read and poll sleep. A failed status read on transport counts as still running and is retried until the budget ends. A turn that pauses for a human action is a failure. Every error after the session exists carries the thread id.

## Why

An unattended caller needs one budget, resilient polling, and a thread id to resume or report.
