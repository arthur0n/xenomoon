---
type: verdicts
title: Documents are timeless; evidence lives on the issue
description: Docs and records state the fact, the date and the issue; run ids, command output, measured values and logs are evidence pasted on the issue and cited, never copied into the doc.
status: stable
tags: [convention, docs]
generated: { by: human:migrate, at: 2026-09-28T00:00:00Z }
---

Docs and records state the fact, the date and the issue; run ids, command output, measured values and logs are evidence pasted on the issue and cited, never copied into the doc.

## Why

Docs stay true longer; the evidence keeps its full context where it was produced.

## Context

A record, plan step, convention or overview states the fact, the date and the issue number. Run ids, session ids,
command output, measured values and log lines are evidence: they are pasted on the issue and cited from the doc by
issue number (or by `file:line` of code). A number that changes with every run does not belong in a doc.

Decision rows and plan steps were filling up with run ids, pasted output and measurements that went stale on the
next run.
