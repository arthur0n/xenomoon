---
name: inbound-body-size-cap
kind: verdicts
description: The inbound receiver caps the raw message at 5 MiB, checked before reading the body, and raises it only if a real user needs more.
status: accepted
tags: [email, security]
date: 2026-09-08
source: platform D19
---

# Inbound body cap of 5 MiB

## Context

Cloudflare delivers inbound mail up to 25 MiB, but its conservative content limit is lower, and 25 MiB only
applies to verified destinations.

## Decision

The receiver checks its bearer secret before reading a byte, then bounds the body at 5 MiB
(`RECEIVER_MAX_BODY_BYTES`). The first value chosen, Cloudflare's 25 MiB inbound limit, was replaced the
same week. The Worker restates the cap and refuses an oversize message before buffering it.

## Why

- "Fix at 5 MiB, raise if a real user needs more."
- Refusing before buffering keeps memory bounded on both sides.
