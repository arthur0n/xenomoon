---
name: decisions-reopened-on-evidence
kind: verdicts
description: Every decision is recorded once with its rationale; evidence that contradicts it re-opens it on the record (amend or supersede), never a quiet change in the code.
status: accepted
tags: [convention, process]
date: 2026-09-03
---

# Decisions are recorded with rationale and re-opened on evidence

## Context

Each repo kept a decisions table and a "challenge log" beside its guidelines. The rule behind them was the same
everywhere.

## Decision

- A decision is written once, with its date, its rationale and what it blocks.
- When evidence contradicts it, say so and re-open it: the outcome is an amend or a supersede of the record, made
  with the `library-record-revise` skill.
- Building something different without re-opening the decision is a violation of `no-workaround-without-approval`.
- An alert that guards a decision, when it fires, re-opens that decision; its threshold is not raised to silence it.

## Why

A decision that changes silently leaves its old rationale standing as a lie.
