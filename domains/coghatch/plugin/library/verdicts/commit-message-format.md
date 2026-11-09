---
type: verdicts
title: Commit message format
description: Commit subject is `<label>(#<issue>): <what>`, imperative, lower case, no trailing period; the gate is green before the commit.
status: stable
tags: [convention, git]
generated: { by: human:migrate, at: 2026-09-05T00:00:00Z }
---

Commit subject is `<label>(#<issue>): <what>`, imperative, lower case, no trailing period; the gate is green before the commit.

## Why

One shape makes history searchable by issue and by kind of change across every repo.

## Context

```
<label>(#<issue>): <what>
```

- `<label>` is one of `feat`, `fix`, `chore`, `docs`, `refactor`, `quality`, `infra`; a fork may add the labels its
  upstream uses.
- Subject in the imperative, lower case, no trailing period.
- The validate gate is green first, its exit code read directly, never through a pipe.
- A change to published-package code carries a changeset when the repo uses them.

Every repo's conventions file carried the same commit section, with small drifts in the label list.
