---
type: verdicts
title: Public front door, auth in code, apps private
description: The access hub runs as a public Cloud Run service with authentication done in its own code, while the agent apps behind it stay private and invokable only by its service account.
status: stable
tags: [auth, infra, network]
source: hub D4
generated: { by: human:migrate, at: 2026-08-30T00:00:00Z }
---

The access hub runs as a public Cloud Run service with authentication done in its own code, while the agent apps behind it stay private and invokable only by its service account.

## Why

The alternatives either cost money (load balancer) or need cloud-provider identities for staff
(identity-aware proxy).

Amended: the access hub later moved behind a global load balancer with load-balancer-only ingress, which

## Context

The access hub runs on Cloud Run with unauthenticated invocation allowed and does authentication in its
own code. The agent apps stay private; only the access hub's service account may invoke them.

The agent apps had to be reachable by employees without exposing them. Cloud Run's built-in options were
an identity-aware proxy (needs cloud-provider user identities) or a load balancer (costs money).
changed the cost reason (`public-host-global-load-balancer`). Auth in code and private apps still hold.
