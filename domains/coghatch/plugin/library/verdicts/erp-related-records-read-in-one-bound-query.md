---
name: erp-related-records-read-in-one-bound-query
kind: verdicts
description: A parent record's children are read with their default address in one ERP query with the parent id as a bound parameter, never one lookup per child and never id text inside SQL.
status: accepted
tags: [connections, security]
date: 2026-10-08
source: tools-server 13
---

# Read related records in one bound query

## Context

Reading one address book per child over the record API took minutes, hit rate limits and overflowed a reply.

## Decision

One SuiteQL statement joins children to their default shipping line and address, with the parent id sent as a bound parameter and checked as digits before. Rows are grouped by child; two default lines for one child or a non-adjacent repeat refuses the read. The tool returns every child, not a preview.

## Why

One query instead of N, no injection surface, and a broken join is refused instead of guessed.
