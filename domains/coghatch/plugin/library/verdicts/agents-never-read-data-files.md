---
type: verdicts
title: Agents never read data files
description: Agents never read customer data files or exports into context, only metadata and counts; raw data lives only in object storage and never in git.
status: stable
tags: [security, llm, process]
source: warehouse convention
generated: { by: human:migrate, at: 2026-08-19T00:00:00Z }
---

Agents never read customer data files or exports into context, only metadata and counts; raw data lives only in object storage and never in git.

## Why

Model context is not a safe place for customer data.

## Context

Look at metadata and counts only; never load customer data into a model context. No credentials or customer data in git; raw data stays in object storage.

Agents work alongside real business data in buckets and exports.
