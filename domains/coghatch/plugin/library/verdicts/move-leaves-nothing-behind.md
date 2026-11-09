---
type: verdicts
title: A move leaves nothing behind
description: A file move is done only when nothing is left behind — no re-export shim, no reversed layer edge, no duplicated helper, no importer on the old path; a gate pass alone is not done.
status: stable
tags: [quality, process]
source: warehouse convention
generated: { by: human:migrate, at: 2026-08-26T00:00:00Z }
---

A file move is done only when nothing is left behind — no re-export shim, no reversed layer edge, no duplicated helper, no importer on the old path; a gate pass alone is not done.

## Why

Leftovers become permanent; the gate does not measure them.

## Context

A shim is a defect, not a step. Dependencies point one way. The issue's file set is a floor, not a ceiling. A green gate is necessary, not sufficient: duplication, layering and dead shims are checked by hand. When 'small' and 'clean' conflict, ask.

Moves were reported done with a shim and importers still on the old path, and a review finding about it was waved off twice.
