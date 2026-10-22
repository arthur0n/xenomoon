---
name: public-host-global-load-balancer
kind: verdicts
description: The public host moves to a global external Application Load Balancer with a TLS 1.2-only policy and load-balancer-only ingress, because the domain mapping is Pre-GA, keeps TLS 1.0/1.1 and leaves the run.app host open; Cloud Armor is deferred on cost.
status: accepted
supersedes: [public-host-cloud-run-domain-mapping]
amends: [single-canonical-host-redirect, front-door-public-service-auth-in-code]
tags: [infra, network, security]
date: 2026-10-21
source: hub M25
---

# Public host behind a global external load balancer

## Context

The access hub carries employee identities and proxies conversations over business data through a Pre-GA
Cloud Run domain mapping. Pre-GA service terms: may change or stop without notice, no SLA, no support,
and customers should not process personal data on it.

## Decision

- One global external Application Load Balancer, a serverless NEG to the service, a managed certificate
  through Certificate Manager DNS authorization (an `_acme-challenge` CNAME, so it can be ACTIVE before
  DNS moves), and an SSL policy with the RESTRICTED profile and minimum TLS 1.2.
- Cut-over with no downtime: prove the load balancer on the canonical host with `curl --resolve` first,
  move DNS, then set ingress to `internal-and-cloud-load-balancing`, then delete the mapping last.
  Restricted ingress also refuses mapping traffic, so ingress changes only after DNS has propagated.
- The canonical-host redirect is removed in the last code step, since ingress then refuses `run.app`.
- Cloud Armor is not adopted now: the unauthenticated surface carries no data. Revisit on flood evidence
  in the load balancer logs, or when a data-bearing surface outside the identity-provider login is
  mounted (MCP). Basic DDoS absorption comes with the load balancer.

## Why

GA status, a 99.99 % SLA, support, TLS 1.2-only, and closing `run.app` are bought for about one
forwarding rule at list price (roughly $18/month plus data processing). It is a supported door, not a
firewall. Not adopted: a design where the upstream app logs users in without the access hub; a CDN proxy.
