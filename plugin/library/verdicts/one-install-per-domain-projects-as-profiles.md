---
type: verdicts
title: one-install-per-domain-projects-as-profiles
description: One framework install per domain; a project is a profile of that install, never a clone of its own.
status: stable
tags: [hub, architecture, install]
generated: { by: human:arthur0n, at: 2026-11-09T13:45:55.796Z }
---

One framework install per domain; a project is a profile of that install, never a clone of its own.

## Why

`plugin/` holds one domain per install, so the domain is the real unit of installation.
A clone per project duplicates tools and drifts versions: a bare `issuekit` on PATH was blocked 8 times in 3 sessions for being an older copy.
Profiles already exist (ui/server/cli/start-profile.js, the `projects` map).

## Context

Amends VISION.md:15, FRAMEWORK.md:26 and README.md:26 ("one install per project"); #65 carries the docs and the other-domain guard.
Later, not now: one install for every domain with the pack loaded per process (#59 "Later").

## Rejected

One install per project (today's layout).
One install for all domains now.

## Consequences

Adding a project is adding a profile; a project of another domain needs that domain's install, and the hub says so.
