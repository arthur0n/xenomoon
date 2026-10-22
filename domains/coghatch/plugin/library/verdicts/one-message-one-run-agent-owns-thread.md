---
name: one-message-one-run-agent-owns-thread
kind: verdicts
description: An email worker is one mail equals one run, run-and-done, no orchestrator and no memory database; a reply is a new run carrying the thread id, and the agent owns the conversation.
status: amended
tags: [workflow-engine, email, agent-forge]
date: 2026-09-05
source: platform D17
---

# One mail, one run; the agent owns the thread

## Context

The legacy flow had an orchestrator (its vendor could not queue from an email trigger) and a memory database
(its workflows were stateless across a reply).

## Decision

Each received mail is one run that completes. A reply is a new run carrying the same thread id; the agent
continues its own conversation. The worker carries the thread id and stored file handles, never the
transcript. Attachments are written to a short-lived object store by the receiver before the event is sent;
the pipeline receives handles, not bytes. One business object per run. A parked run waiting days for a reply
was rejected.

## Why

- The workflow engine queues natively, so an orchestrator has no counterpart.
- The agent keeps the thread, and files outlive the run in the store.
