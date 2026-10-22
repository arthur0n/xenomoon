---
name: thread-id-marker-in-mail-body
kind: verdicts
description: The conversation thread id travels in the mail body as a marker the question mail writes and the pipeline parses from the reply, restricted to a safe character set; the receiver knows nothing about threads.
status: accepted
tags: [email, agent-forge]
date: 2026-09-07
source: platform D20
---

# Thread id as a marker in the mail body

## Context

A reply must continue the same agent conversation. Mail headers are not reliably preserved by every client.

## Decision

The question mail ends with `[#THREADID:<id>]`, the id restricted to `[A-Za-z0-9_-]` so it survives HTML
escaping. The pipeline parses the first marker from the incoming body and strips it before the agent sees the
text. Every model-written or config-supplied text rendered before the marker is stripped of markers, and a
config value carrying one fails the boot, so a forged marker cannot choose the conversation.

## Why

- Body text survives forwarding and quoting.
- Accepted exposure: the marker is not bound to its sender, so another allow-listed sender with a copied
  marker continues that thread; only internal senders reach the address.
