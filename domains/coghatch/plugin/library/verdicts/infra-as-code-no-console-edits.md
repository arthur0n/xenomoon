---
name: infra-as-code-no-console-edits
kind: verdicts
description: Schemas, view SQL, deploy scripts and docs live in a private repo with no manual console edits; view SQL uses project and dataset placeholders so it deploys to any project.
status: accepted
tags: [infra, data-warehouse]
date: 2026-08-18
source: warehouse convention
---

# Everything as code, no console edits

## Context

The warehouse is a template meant to be copied to other clients.

## Decision

All warehouse objects and deploy steps are files in a private repo. View SQL uses placeholders, not real ids. No changes in the web console.

## Why

Reproducible per client and reviewable.
