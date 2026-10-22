---
name: white-label-brand-per-deploy
kind: verdicts
description: One image serves any brand — at start the server reads a validated brand directory and writes title, icons, fonts and theme into the served page; branding is cosmetic only.
status: accepted
tags: [agent-forge, ui, upstream-fork]
date: 2026-09-25
source: forge A14
---

# White-label UI, brand per deploy

## Context

The harness UI should carry the client's look without a build per client and without a large diff against upstream.

## Decision

Brand code lives in new files of ours; upstream files get only the few lines that call them. At start the server reads a brand directory (a schema-validated config plus logo, icon and favicon) and rewrites the served index page once, the same way upstream injects its base path. Colour tokens map onto the UI library's theme config.

## Why

One image for every deploy, a small upstream diff, and no behaviour change hidden in branding.
