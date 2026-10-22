---
name: agents-never-read-data-files
kind: verdicts
description: Agents never read customer data files or exports into context, only metadata and counts; raw data lives only in object storage and never in git.
status: accepted
tags: [security, llm, process]
date: 2026-08-19
source: warehouse convention
---

# Agents never read data files

## Context

Agents work alongside real business data in buckets and exports.

## Decision

Look at metadata and counts only; never load customer data into a model context. No credentials or customer data in git; raw data stays in object storage.

## Why

Model context is not a safe place for customer data.
