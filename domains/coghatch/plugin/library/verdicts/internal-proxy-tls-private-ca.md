---
name: internal-proxy-tls-private-ca
kind: verdicts
description: The VM's auth proxy serves TLS only, with a server certificate signed by a private CA every caller trusts, because encryption of the Cloud Run to VM hop is implied by Google's docs, not documented.
status: amended
amends: [vm-no-public-ip-cloud-nat]
tags: [network, security, secrets, observability]
date: 2026-09-30
source: platform D12
---

# Proxy TLS with a private CA

## Context

Callers reached the VM proxy over plain HTTP inside the VPC. Google documents encryption for VM-to-VM traffic,
but no page states that a Cloud Run Direct VPC egress connection to a VM is covered.

## Decision

The proxy port carries TLS only; no plain-HTTP fallback listener. A private CA (self-managed, no managed CA
service, no load balancer) signs the server certificate, which names the IP addresses callers use; the proxy
refuses to start if its certificate does not name each configured address. Keys are ECDSA P-256, generated
straight into Secret Manager, never written to an operator's disk; the CA key has no runtime reader. Each
caller trusts a bundle of one or two CA certificates, so a CA replacement needs no simultaneous switch.
Server certificate 1 year, CA 5 years. The VM logs days-to-expiry hourly; one alert fires 30 days before
expiry, a second fires when samples stop for 23.5 h (the metric-absence maximum).

## Why

- The platform does not rest a control on an implication.
- The CA outlives its certificates, so yearly rotation touches the VM alone.
- An absence alert keeps a dead sampler from looking like a healthy certificate.
