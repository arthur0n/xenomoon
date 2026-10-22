---
name: connections-package-messages-consumer-neutral
kind: verdicts
description: A message the shared connections package emits names no consumer, no consumer's deployment resource and no command; each consumer keeps its own remedy line where its operators read.
status: accepted
amends: [connections-package-separate-repo]
tags: [connections, observability]
date: 2026-10-17
source: platform D9
---

# Package messages are consumer-neutral

## Context

Once a second consumer used the package, an error message that named one consumer's service or fix
command was wrong for the other.

## Decision

A package message may name shared environment variable names and secret names, never a value, never a
consumer, never a consumer's service/job/VM, never a command. It holds for every consumer or it is not the
package's message. Each consumer adds its own remedy text where its operators read logs.

## Why

- A shared library cannot know how each consumer is deployed.
- Misleading remedies cost more than missing ones.
