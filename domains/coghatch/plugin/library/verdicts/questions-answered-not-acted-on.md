---
name: questions-answered-not-acted-on
kind: verdicts
description: A question gets an answer and at most a suggestion — no edit, commit, push or deploy in the same turn; state-changing work starts only on an explicit go, and only for what was asked.
status: accepted
tags: [convention, process, agents]
date: 2026-09-21
---

# Questions are answered, never acted on

## Context

An agent asked "why…?" implemented three variants of a fix in a row and pushed one unasked.

## Decision

"Why…?", "should we…?", "what is this?" get a direct answer and, if useful, a suggestion. No edit, commit, push,
deploy or new solution in the same turn. State-changing work starts on an explicit "go", "proceed" or "merge", and
only for the thing that was asked. One question per unknown; never guess what an ambiguous reference means. The plan
is executed as written or amended on the record; a decided question is not re-asked.

## Why

Acting on a question takes the decision away from the person asking it.
