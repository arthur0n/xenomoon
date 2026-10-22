---
name: outbound-mail-smtp-submission
kind: verdicts
description: Outbound automation mail was first sent by authenticated SMTP submission on port 465 to a hosted mailbox, because GCP blocks port 25 and adds no new vendor.
status: superseded
tags: [email, infra]
date: 2026-09-09
source: platform D1
---

# Outbound mail by SMTP submission (replaced)

## Context

Pipelines must mail answers and questions back. Google Cloud blocks egress to TCP port 25 by default, and
Cloud NAT has no reverse DNS record, so a self-hosted mail server was not an option.

## Decision

Send by SMTP AUTH submission on 465 (implicit TLS, certificate verification on) to a hosted mailbox, with
host, port and user in config and the password in Secret Manager. Rejected at the time: a self-hosted MTA,
Microsoft 365 sending (it would bring back the mailbox rule), Cloudflare Email Sending (beta), and a new
transactional vendor.

## Why

- Ports 465/587 are open from GCP; no new vendor was needed.
- Replaced two days later by a transactional mail API (see the superseding record).
