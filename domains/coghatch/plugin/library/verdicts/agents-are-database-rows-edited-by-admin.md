---
name: agents-are-database-rows-edited-by-admin
kind: verdicts
description: Agents are database rows edited and published in the UI by an admin, never git files synced on a roll; a policy table beside upstream's agents table holds status and access, and the database backup is the only copy.
status: accepted
tags: [agent-forge, backups]
date: 2026-10-20
source: forge A56
---

# Agents are rows, edited by an admin

## Context

Agents lived as git files synced at server start, so every prompt change needed a commit and a deploy.

## Decision

One policy table keyed by agent name carries what we add to upstream's agents table (status, pipeline-only, access). A version table keeps the last published versions. Manage and delete are admin-only; read and use follow status and access; no policy row means draft. The startup sync, the agents folder and the sync CLI are removed.

## Why

A prompt edit should not be a release. Rejected: git as source with the server committing on publish (a write token and a re-sync per change); a column on upstream's table (upstream diff).
