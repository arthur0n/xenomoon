---
name: front-door-public-service-auth-in-code
kind: verdicts
description: The access hub runs as a public Cloud Run service with authentication done in its own code, while the agent apps behind it stay private and invokable only by its service account.
status: amended
tags: [auth, infra, network]
date: 2026-08-30
source: hub D4
---

# Public front door, auth in code, apps private

## Context

The agent apps had to be reachable by employees without exposing them. Cloud Run's built-in options were
an identity-aware proxy (needs cloud-provider user identities) or a load balancer (costs money).

## Decision

The access hub runs on Cloud Run with unauthenticated invocation allowed and does authentication in its
own code. The agent apps stay private; only the access hub's service account may invoke them.

## Why

The alternatives either cost money (load balancer) or need cloud-provider identities for staff
(identity-aware proxy).

Amended: the access hub later moved behind a global load balancer with load-balancer-only ingress, which
changed the cost reason (`public-host-global-load-balancer`). Auth in code and private apps still hold.
