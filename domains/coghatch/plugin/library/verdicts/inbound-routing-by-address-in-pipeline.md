---
name: inbound-routing-by-address-in-pipeline
kind: verdicts
description: One inbound event and one contract for every mail; each pipeline subscribes with a trigger filter on its own address, which is one config value also used as its Reply-To, so the receiver knows no pipeline.
status: amended
amends:
  [
    contracts-and-adapters-per-capability,
    one-message-one-run-agent-owns-thread,
    inbound-mail-cloudflare-email-worker,
  ]
tags: [email, workflow-engine]
date: 2026-09-07
source: platform D20
---

# Routing by address in the pipeline

## Context

Several automations share one inbound path. Routing could live in the receiver, in the address encoding,
or in one Worker per automation.

## Decision

The receiver emits `email/received` for every mail: message id, lower-cased `to`, from, subject, plain-text
body, and stored-file handles (never bytes). A pipeline subscribes with
`if: event.data.to == <its address>`; the address is one config value per pipeline, used by the trigger and
as the Reply-To of every mail it sends. The receiver becomes a second composition root. A new automation is a
pipeline folder plus its address; Cloudflare, the Worker and the receiver are not touched.

## Why

- The pipeline must know its address for Reply-To anyway, so it is the only owner.
- The receiver is finished once. Lower-casing matters: an upper-case `to` would match nothing, silently.
