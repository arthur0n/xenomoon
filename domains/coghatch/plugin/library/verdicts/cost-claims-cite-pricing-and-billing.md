---
name: cost-claims-cite-pricing-and-billing
kind: verdicts
description: No cost claim anywhere without both the provider's pricing sentence (with link and read date) and a number from billing data or run durations; 'free' is written only when the pricing page says it for our billing mode.
status: accepted
tags: [cost, process]
date: 2026-08-30
source: warehouse convention
---

# Cost claims need a source and a measurement

## Context

Docs said the estate cost nothing; container jobs were in fact billed per instance-second with a minimum, and had been all along.

## Decision

Every cost statement cites the pricing page sentence and a measured number. Every batch run states its estimate first. A claim that cannot cite the pricing reference is deleted.

## Why

A wrong 'free' hid a real bill for months.
