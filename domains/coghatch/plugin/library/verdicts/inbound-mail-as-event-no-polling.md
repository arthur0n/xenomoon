---
name: inbound-mail-as-event-no-polling
kind: verdicts
description: The inbound receiver turns each received mail into an event; there is no mailbox polling and no mail subscription, because there is no mailbox to poll.
status: accepted
tags: [email, workflow-engine]
date: 2026-09-03
source: platform D5
---

# Each received mail becomes an event

## Context

Once the trigger is a technical address rather than a mailbox, the question of how pipelines learn about
new mail changes shape.

## Decision

The inbound receiver emits one event per received mail. No polling loop, no Graph-style subscription, no
singleton poller.

## Why

- Follows directly from having no mailbox.
- Removes the polling and singleton design from the pipeline phase entirely.
