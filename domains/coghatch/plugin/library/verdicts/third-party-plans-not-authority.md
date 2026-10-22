---
name: third-party-plans-not-authority
kind: verdicts
description: A plan, snippet or recommendation from another agent, a blog, a vendor page, an older sibling repo or a memory is input to verify, never authority to adopt.
status: accepted
tags: [convention, process]
date: 2026-09-03
---

# Third-party plans are not authority

## Context

Plans inherited from earlier sessions, vendor reference architectures and sibling repos were being copied with
their confidence intact and their evidence missing.

## Decision

Anything proposed from outside the repo's own record — a library choice, a config shape, a limit, a version — is
re-checked on the day against reality (`verify-against-source-not-memory`, `no-invented-numbers`) before a line of it
is kept. Nothing is adopted because it was written down confidently.

## Why

Confident text is not evidence; re-checking is cheaper than unwinding an adopted mistake.
