---
name: writes-proven-by-one-real-run
kind: verdicts
description: There is no dry-run gate; a new write path is proven by one real production run on records the owner names and cleans up after, and sending mail is not treated as a write.
status: amended
supersedes: [write-dry-run-gate]
tags: [testing, email]
date: 2026-09-11
source: platform D3
---

# Writes proven by one real run

## Context

The dry-run gate added a "prove with the flag on first" phase to every write path. Mail paths were held
behind it even though a mail is the thing being tested.

## Decision

No dry-run gate in the MVP. A new ERP write path is proven by one real run in production on records the
owner names, which the owner closes or deletes afterwards. Sending mail is not a write: a mail path is tested
end to end, live, from the first run. A mail dry-run switch may exist as an operator tool, never as a proof
step.

## Why

- A flag phase proved the payload shape, not that the write works.
- One named, cleaned-up record is a small, owned side effect.
