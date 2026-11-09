---
type: verdicts
title: One shared failure handler, mailing ops
description: Every workflow function is registered with one shared onFailure handler that mails the ops address with function id, run id, event id and error message only, never the payload or secrets.
status: stable
supersedes: [failure-alerts-to-sender-and-ops]
tags: [observability, email, workflow-engine, security]
source: platform D2
generated: { by: human:migrate, at: 2026-09-10T00:00:00Z }
---

Every workflow function is registered with one shared onFailure handler that mails the ops address with function id, run id, event id and error message only, never the payload or secrets.

## Why

- One handler means no function can ship without failure notification.
- Leaving the payload out by signature, not by discipline, keeps message content and secrets out of alerts.

## Context

One shared `onFailure` handler is attached to every workflow function. It mails the configured ops address
with the function id, run id, event id and error message. The mail builder takes no payload parameter at
all, so the triggering event cannot reach it. Customer-facing context (for example the sender address) is a
row in the ops mail, not a mail to the sender. An agent's failure mail is sent from that agent's address.

Per-pipeline failure mail meant duplicated code and gaps: a new function shipped with no failure mail.
