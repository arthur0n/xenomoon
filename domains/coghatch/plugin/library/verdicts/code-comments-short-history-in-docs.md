---
name: code-comments-short-history-in-docs
kind: verdicts
description: A file header is at most five lines with a pointer to its reference doc; inline comments explain only a non-obvious why; history, review findings and design essays go in the doc once.
status: accepted
tags: [quality, process]
date: 2026-08-26
source: warehouse convention
---

# Short comments, history in the docs

## Context

Code headers grew into design essays and review logs that drifted from the code.

## Decision

Header: what the file is plus a pointer to its reference section, five lines max. Inline comments only where a line is non-obvious. Prose moves to the reference doc, which must already hold every claim before the comment is deleted. Applied file by file as files are touched, never as a bulk rewrite.

## Why

One home for each explanation; code stays readable.
