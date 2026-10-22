---
name: front-door-direct-oidc-own-gateway
kind: verdicts
description: The front door signs users in with direct OIDC against the organisation's Entra tenant and runs its own gateway, because it was the only zero-cost path that uses the existing work identities and needs no cloud-provider accounts.
status: accepted
tags: [auth, infra]
date: 2026-08-28
source: hub D1
---

# Direct OIDC to the identity provider plus an own gateway

## Context

Private agent apps on Cloud Run needed a front door for employees who already have Entra work
identities and no cloud-provider user accounts. Options included a managed identity-aware proxy, a paid
load balancer setup, and a direct OIDC gateway.

## Decision

Option C: the access hub talks OIDC directly to Entra (relying party) and runs its own gateway with
sessions, an ACL and a reverse proxy to the private apps.

## Why

Evaluated 2026-08-28: it was the only $0 path that uses the existing work identities and needs no
cloud-provider accounts for staff.
