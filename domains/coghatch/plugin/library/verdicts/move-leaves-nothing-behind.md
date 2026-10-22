---
name: move-leaves-nothing-behind
kind: verdicts
description: A file move is done only when nothing is left behind — no re-export shim, no reversed layer edge, no duplicated helper, no importer on the old path; a gate pass alone is not done.
status: accepted
tags: [quality, process]
date: 2026-08-26
source: warehouse convention
---

# A move leaves nothing behind

## Context

Moves were reported done with a shim and importers still on the old path, and a review finding about it was waved off twice.

## Decision

A shim is a defect, not a step. Dependencies point one way. The issue's file set is a floor, not a ceiling. A green gate is necessary, not sufficient: duplication, layering and dead shims are checked by hand. When 'small' and 'clean' conflict, ask.

## Why

Leftovers become permanent; the gate does not measure them.
