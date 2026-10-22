---
name: cloud-resource-labels
kind: verdicts
description: Every cloud resource that accepts labels is created with service, component and env labels in the create command, because labels are the only cost attribution.
status: accepted
tags: [convention, infra, cost]
date: 2026-09-03
---

# Every cloud resource carries three labels

## Context

Several services share one VM and one cloud project; billing cannot split them otherwise.

## Decision

Every bucket, secret, VM, registry, service and container that accepts labels carries
`service=<system>`, `component=<piece>`, `env=<env>`, set in the create command, never added afterwards. `service`
is what the billing export groups by; `component` names the piece; a resource shared by several components gets its
own component value (e.g. `registry`) rather than one it would misattribute.

## Why

A resource created without labels cannot be found in the billing export.
