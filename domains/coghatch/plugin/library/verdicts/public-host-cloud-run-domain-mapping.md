---
name: public-host-cloud-run-domain-mapping
kind: verdicts
description: The public host was attached with a Cloud Run domain mapping (DNS-only record), accepted as an interim risk because it has no price line, despite being Pre-GA and unable to disable TLS 1.0/1.1.
status: superseded
tags: [infra, network, security]
date: 2026-10-01
source: hub M20
---

# Public host via a Cloud Run domain mapping

## Context

The access hub needed a custom public host. Options were a Cloud Run domain mapping, a global external
Application Load Balancer, or a CDN-proxied hostname on a free plan.

## Decision

Attach the host with a Cloud Run domain mapping, DNS record not proxied. The general-availability path is
a separate decision.

## Why

- The mapping has no price line and needs nothing outside Cloud Run.
- Accepted risks: the feature is Pre-GA and "not recommended for production"; TLS 1.0/1.1 cannot be
  disabled on it.
- Not adopted: a CDN-proxied hostname on a free plan. Host-header override is enterprise-only there, so a
  worker would have to rewrite `Host`; the `run.app` host stays reachable because Cloud Run ingress has no
  IP allowlist; and a rewritten `Host` would loop against the canonical-host redirect.

Superseded by `public-host-global-load-balancer`.
