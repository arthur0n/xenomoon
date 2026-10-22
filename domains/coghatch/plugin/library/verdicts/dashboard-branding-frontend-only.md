---
name: dashboard-branding-frontend-only
kind: verdicts
description: The workflow dashboard may be branded per client cosmetically, frontend only, with no backend change; the branded image is built by the client repo's CI, pinned by digest, and runs the same engine version.
status: accepted
tags: [workflow-engine, ci]
date: 2026-09-25
source: platform D30
---

# Cosmetic dashboard branding

## Context

The self-hosted Inngest server has no branding flag or env var. Every brand element is a frontend file
embedded in the server binary at build time.

## Decision

In scope: logo, colours, fonts, title, favicon, menu (including links out or pages built on data the existing
API serves). The mechanism (edit the UI source and rebuild, or an overlay in front) is chosen per client.
Edits follow a runbook, are committed in that client's repo, built by its CI and named by digest; never built
by hand and never pushed to the vendor mirror. Every engine upgrade re-checks the brand edits.

## Why

- The vendor mirror refuses a digest that differs from upstream, so branded images need their own destination.
- Frontend-only keeps the server behaviour identical to the pinned release.
