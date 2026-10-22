---
name: commit-message-format
kind: verdicts
description: Commit subject is `<label>(#<issue>): <what>`, imperative, lower case, no trailing period; the gate is green before the commit.
status: accepted
tags: [convention, git]
date: 2026-09-05
---

# Commit message format

## Context

Every repo's conventions file carried the same commit section, with small drifts in the label list.

## Decision

```
<label>(#<issue>): <what>
```

- `<label>` is one of `feat`, `fix`, `chore`, `docs`, `refactor`, `quality`, `infra`; a fork may add the labels its
  upstream uses.
- Subject in the imperative, lower case, no trailing period.
- The validate gate is green first, its exit code read directly, never through a pipe.
- A change to published-package code carries a changeset when the repo uses them.

## Why

One shape makes history searchable by issue and by kind of change across every repo.
