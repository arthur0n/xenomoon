---
name: no-workaround-without-approval
kind: verdicts
description: A rule, decision or requirement that blocks the work is challenged out loud and changed on the record, never routed around — every other convention depends on this one.
status: accepted
tags: [convention, process]
date: 2026-09-03
---

# No workaround without approval

## Context

Every repo in the stack carried the same rule 0 in its own guidelines file. The copies drifted in wording but not
in meaning.

## Decision

When a rule, a recorded decision or a requirement blocks the work:

1. Stop.
2. State what is blocked, what the rule says, and the evidence.
3. Ask the owner.

Never route around it, never ship "a small exception", never rename a thing so the rule no longer seems to apply.
A rule that turns out to be wrong is changed on the record (amend or supersede the record that holds it).

## Why

A rule that can be bypassed quietly is not a rule. Every other convention record assumes this one holds.
