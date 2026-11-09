---
type: verdicts
title: Types generated from table schemas
description: Transform outputs are typed by types generated from the table schema files; generated types are committed and CI regenerates and diffs them, so schema drift fails the build.
status: stable
tags: [data-warehouse, quality, testing]
source: warehouse convention
generated: { by: human:migrate, at: 2026-08-18T00:00:00Z }
---

Transform outputs are typed by types generated from the table schema files; generated types are committed and CI regenerates and diffs them, so schema drift fails the build.

## Why

Drift becomes a compile error instead of missing data.

## Context

Generate TypeScript types from the schema JSON files, commit them, and have CI regenerate and diff. Strict TypeScript, zero lint warnings, and the same size and complexity limits on every source file.

A schema change that the transform does not follow would load NULLs silently.
