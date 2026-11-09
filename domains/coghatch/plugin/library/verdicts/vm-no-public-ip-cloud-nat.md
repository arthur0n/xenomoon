---
type: verdicts
title: No public IP plus Cloud NAT
description: The VM has no public IP and reaches the internet through Cloud NAT, in a purpose-built VPC with ID-token verification at the VM and Direct VPC egress on callers, unless NAT egress volume turns out large.
status: stable
tags: [network, infra, security]
source: platform D12
generated: { by: human:migrate, at: 2026-09-03T00:00:00Z }
---

The VM has no public IP and reaches the internet through Cloud NAT, in a purpose-built VPC with ID-token verification at the VM and Direct VPC egress on callers, unless NAT egress volume turns out large.

## Why

- Data to Google services moves over Private Google Access, which is neither NAT data nor internet egress;
  only external API calls leave, at the same cost either way.
- An alert at the NAT-data break-even point re-opens the decision; switching is a one-VM change with no data

## Context

Option 1: no public IP, Cloud NAT for egress. Both options required, and the platform has: a purpose-built
VPC with two subnets, Google ID-token verification at the VM (an auth proxy in front of the workflow server
and app, using `google-auth-library`), and Direct VPC egress on the Cloud Run callers.

The VM hosts the workflow server and app. Two exposure options were analysed and adversarially reviewed: no
public IP with Cloud NAT, or a public IP with firewalling.
migration. A second alert guards NAT port exhaustion.
