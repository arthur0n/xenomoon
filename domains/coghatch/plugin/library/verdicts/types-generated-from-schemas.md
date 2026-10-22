---
name: types-generated-from-schemas
kind: verdicts
description: Transform outputs are typed by types generated from the table schema files; generated types are committed and CI regenerates and diffs them, so schema drift fails the build.
status: accepted
tags: [data-warehouse, quality, testing]
date: 2026-08-18
source: warehouse convention
---

# Types generated from table schemas

## Context

A schema change that the transform does not follow would load NULLs silently.

## Decision

Generate TypeScript types from the schema JSON files, commit them, and have CI regenerate and diff. Strict TypeScript, zero lint warnings, and the same size and complexity limits on every source file.

## Why

Drift becomes a compile error instead of missing data.
