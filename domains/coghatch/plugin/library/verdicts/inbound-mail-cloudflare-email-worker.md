---
name: inbound-mail-cloudflare-email-worker
kind: verdicts
description: Inbound mail arrives by Cloudflare Email Routing catch-all to an Email Worker that POSTs the raw message to a public Cloud Run receiver, which stores attachments and emits one event through the ID-token proxy; the domain is configuration, never code.
status: amended
amends: [inbound-email-technical-address]
tags: [email, network, infra]
date: 2026-09-06
source: platform D19
---

# Inbound mail through a Cloudflare Email Worker

## Context

Six inbound options were compared (mail routing plus worker, a transactional vendor's inbound, mailbox
polling and others). The mail should never touch a Microsoft mailbox.

## Decision

Cloudflare Email Routing on a zone the platform controls, catch-all rule → Email Worker → public Cloud Run
receiver (the only public entry point) → VM proxy via Direct VPC egress with a Google ID token → workflow
engine. The Worker authenticates to the receiver with a bearer secret. The receiver parses MIME, stores every
attachment, then emits one event per mail with the Message-ID as event id. Which pipeline runs is the
pipeline's trigger filter, so a new address is platform config, never Cloudflare work. The zone is bound by
the routing rule; switching to a client's zone reuses the same Worker and receiver. Fallback: a transactional
vendor's inbound route.

## Why

- No polling, no mailbox, no Graph.
- Conditional on a proof that the email handler can `fetch()`; the proof passed with a real DMARC-passing mail.
