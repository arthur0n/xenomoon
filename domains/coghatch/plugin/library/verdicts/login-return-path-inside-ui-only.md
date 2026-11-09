---
type: verdicts
title: Return path after login stays inside the UI
description: The return path after login is accepted only when it is a single-slash path, unchanged by URL resolution, and inside the UI base path; anything else goes to the UI home.
status: stable
tags: [auth, security, ui]
source: forge A43
generated: { by: human:migrate, at: 2026-10-06T00:00:00Z }
---

The return path after login is accepted only when it is a single-slash path, unchanged by URL resolution, and inside the UI base path; anything else goes to the UI home.

## Why

Browsers normalise paths in ways that leave the site; only the exact resolved form is safe.

## Context

One function owns the rule for every caller. The value starts with exactly one slash and holds no backslash or control character; resolved against a fixed placeholder origin it must keep that origin and come back byte-identical (so dot segments, dropped tabs, a bare ? or # are refused); and its path must start with the UI base path. Anything else redirects to the UI home.

A return-to parameter is a classic open-redirect hole: backslashes, dot segments and control characters can make a path leave the site.
