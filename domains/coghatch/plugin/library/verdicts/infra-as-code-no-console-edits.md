---
type: verdicts
title: Everything as code, no console edits
description: Schemas, view SQL, deploy scripts and docs live in a private repo with no manual console edits; view SQL uses project and dataset placeholders so it deploys to any project.
status: stable
tags: [infra, data-warehouse]
source: warehouse convention
generated: { by: human:migrate, at: 2026-08-18T00:00:00Z }
---

Schemas, view SQL, deploy scripts and docs live in a private repo with no manual console edits; view SQL uses project and dataset placeholders so it deploys to any project.

## Why

Reproducible per client and reviewable.

## Context

All warehouse objects and deploy steps are files in a private repo. View SQL uses placeholders, not real ids. No changes in the web console.

The warehouse is a template meant to be copied to other clients.
