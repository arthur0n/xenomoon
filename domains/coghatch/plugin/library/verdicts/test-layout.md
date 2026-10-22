---
name: test-layout
kind: verdicts
description: Tests live in a __tests__ folder beside the code, one file per exported name; shared test support is one fixtures file per folder; none of it ships, and one guard test proves that.
status: accepted
tags: [convention, testing]
date: 2026-09-14
---

# Test layout — one convention for every repo

## Context

The same test-layout rule was copied into the guidelines or conventions of every repo, each copy saying "a change
is made in all of them". That is the drift this record replaces.

## Decision

1. Tests sit in a `__tests__/` folder beside the code they cover, one file per exported name: `<name>.test.ts`, or
   `<name>.<concern>.test.ts` when split by concern (a size cap is met by a split, never a trim). No `*.test.ts`
   outside `__tests__/`.
2. Test support shared by more than one test file is `fixtures.ts`, at most one per source folder, beside the code
   it doubles. A double used by one test stays in that test. Runtime code never imports a fixture. An oversized
   `fixtures.ts` splits into `__tests__/<concern>.fixtures.ts`; a contract suite shared by implementations is
   `__tests__/<name>.contract.ts`.
3. Never shipped: the emitting tsconfig excludes `**/*.test.ts`, `**/__tests__/**`, `**/fixtures.ts`; a tooling
   tsconfig (`noEmit`) type-checks exactly those. A repo that ships sources carries the same patterns in
   `.dockerignore`.
4. One guard test asserts the shipped artifact holds none of those files and every runtime source imports only
   declared dependencies; it reads the patterns from where rule 3 states them.

A fork of an upstream project follows the upstream's own test layout instead.

## Why

One shape across repos; test code can never reach production.
