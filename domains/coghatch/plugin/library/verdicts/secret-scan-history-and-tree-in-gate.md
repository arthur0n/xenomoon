---
type: verdicts
title: Secret scan of history and working tree in the gate
description: The gate scans full git history and then the working tree for secrets, a missing scanner fails the gate, the image builds only after validate on main, and a vulnerable transitive dependency is pinned by a dated override.
status: stable
tags: [ci, security, secrets]
source: tools-server 11
generated: { by: human:migrate, at: 2026-10-01T00:00:00Z }
---

The gate scans full git history and then the working tree for secrets, a missing scanner fails the gate, the image builds only after validate on main, and a vulnerable transitive dependency is pinned by a dated override.

## Why

A history scan cannot see what is not committed yet; a skipped security step must be loud.

## Context

The gate's first step scans full history, then the working tree. A missing scanner binary fails the gate; CI installs a checksum-pinned release. One CI workflow: the image job needs validate and runs on main only. A vulnerable transitive dependency without an upstream fix gets an exact override with its reason and date.

A token-shaped test literal passed the local gate (history scan only) and was caught by CI after the commit. An ungated image job had published red commits.
