---
type: verdicts
title: Read related records in one bound query
description: A parent record's children are read with their default address in one ERP query with the parent id as a bound parameter, never one lookup per child and never id text inside SQL.
status: stable
tags: [connections, security]
source: tools-server 13
generated: { by: human:migrate, at: 2026-10-08T00:00:00Z }
---

A parent record's children are read with their default address in one ERP query with the parent id as a bound parameter, never one lookup per child and never id text inside SQL.

## Why

One query instead of N, no injection surface, and a broken join is refused instead of guessed.

## Context

One SuiteQL statement joins children to their default shipping line and address, with the parent id sent as a bound parameter and checked as digits before. Rows are grouped by child; two default lines for one child or a non-adjacent repeat refuses the read. The tool returns every child, not a preview.

Reading one address book per child over the record API took minutes, hit rate limits and overflowed a reply.
