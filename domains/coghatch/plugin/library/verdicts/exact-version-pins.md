---
name: exact-version-pins
kind: verdicts
description: Third-party dependencies, image tags and CI actions are exact pins researched on the day with the date recorded; only the team's own internal packages take a caret range.
status: accepted
tags: [convention, deps, supply-chain]
date: 2026-09-03
---

# Exact version pins, researched on the day

## Context

Ranges let a new third-party release reach production without review. Remembered versions were often stale.

## Decision

- Every third-party dependency (`dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies`) is an
  exact version: no `^`, `~`, `>=`, `x`, `*`, tag, URL or git spec. `.npmrc` sets `save-exact=true`, and the gate
  reads the manifest itself, because `save-exact` only governs `add`.
- The version is researched against the registry on the day it is written; `package.json` records it
  (`"versionsResearched": "<YYYY-MM-DD>, npm registry"`) and the gate fails without an ISO date there.
- Container images are pinned by digest; CI actions by full commit SHA with the tag in a trailing comment.
- Exceptions: the package manager's `workspace:*` link, and the team's own internal scope, which takes a plain
  `^x.y.z` caret so a patch release flows without a manifest edit. The internal scope is also the only entry in
  the package manager's release-age exclusion; a third-party pin waits out the window instead.
- The lockfile is committed and CI installs frozen.

## Why

The manifest states the reviewed version; the lockfile is not a substitute. Internal packages are the team's own
code from its own CI, so the supply-chain rule does not apply to them.
