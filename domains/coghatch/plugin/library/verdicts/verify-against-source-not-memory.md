---
name: verify-against-source-not-memory
kind: verdicts
description: Before a library, SDK, CLI or vendor behaviour goes into a doc or code, confirm it in the installed types, the source, or the official docs and cite where — never from memory.
status: accepted
tags: [convention, deps]
date: 2026-09-03
---

# Verify against the source, never from memory

## Context

Option names, export names, CLI flags, env vars and model ids drift between versions. Plans built on remembered
APIs failed at build time.

## Decision

Before writing a call, flag or behaviour into a doc or code, confirm it exists: read the installed package's
`.d.ts` or source, or the official docs, and write the citation (`file:line` or the doc page and the date read)
next to the claim. A citation that turns out wrong is a finding to fix, not a footnote.

## Why

A wrong claim with no citation cannot be re-checked; a cited one can be re-read in one step.
