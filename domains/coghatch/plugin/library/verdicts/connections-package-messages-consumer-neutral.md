---
type: verdicts
title: Package messages are consumer-neutral
description: A message the shared connections package emits names no consumer, no consumer's deployment resource and no command; each consumer keeps its own remedy line where its operators read.
status: stable
amends: [connections-package-separate-repo]
tags: [connections, observability]
source: platform D9
generated: { by: human:migrate, at: 2026-10-17T00:00:00Z }
---

A message the shared connections package emits names no consumer, no consumer's deployment resource and no command; each consumer keeps its own remedy line where its operators read.

## Why

- A shared library cannot know how each consumer is deployed.
- Misleading remedies cost more than missing ones.

## Context

A package message may name shared environment variable names and secret names, never a value, never a
consumer, never a consumer's service/job/VM, never a command. It holds for every consumer or it is not the
package's message. Each consumer adds its own remedy text where its operators read logs.

Once a second consumer used the package, an error message that named one consumer's service or fix
command was wrong for the other.
