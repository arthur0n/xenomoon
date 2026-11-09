---
type: verdicts
title: Each received mail becomes an event
description: The inbound receiver turns each received mail into an event; there is no mailbox polling and no mail subscription, because there is no mailbox to poll.
status: stable
tags: [email, workflow-engine]
source: platform D5
generated: { by: human:migrate, at: 2026-09-03T00:00:00Z }
---

The inbound receiver turns each received mail into an event; there is no mailbox polling and no mail subscription, because there is no mailbox to poll.

## Why

- Follows directly from having no mailbox.
- Removes the polling and singleton design from the pipeline phase entirely.

## Context

The inbound receiver emits one event per received mail. No polling loop, no Graph-style subscription, no
singleton poller.

Once the trigger is a technical address rather than a mailbox, the question of how pipelines learn about
new mail changes shape.
