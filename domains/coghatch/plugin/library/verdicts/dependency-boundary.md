---
name: dependency-boundary
kind: verdicts
description: Each repo enforces what its code may depend on with real controls — an eslint import wall and a dependency allow-list checked by a script, both reading one list — and a new dependency arrives with its reason in the same diff.
status: accepted
tags: [convention, deps, architecture]
date: 2026-09-04
---

# Dependency boundary = real controls, one list

## Context

Repos that should talk to outside systems only through a shared connections package kept growing direct vendor
SDK imports.

## Decision

- **Import wall:** eslint `no-restricted-imports` on the runtime folders refuses the restricted vendor SDKs (or,
  inverted, allows only an allow-list plus `node:*` and in-repo files).
- **Dependency allow-list:** a check script asserts `dependencies` against the same list, failing in either
  direction (an undeclared import or an unexpected dependency).
- **One list:** both controls read one module, so the lint rule and the scanner cannot drift.
- **One way in:** in a bounded folder only static `import` and `import("literal")` load modules; `require`,
  `createRequire`, `eval`, `new Function` and `import.meta.resolve` are refused on sight.
- A new runtime dependency lands with its reason in the decision record and its name in the list, in one diff.
- A fake-dependency test proves the core logic needs nothing domain-specific.

## Why

A rule nobody enforces drifts; a boundary that is a lint failure is visible in the diff.
