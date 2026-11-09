---
type: verdicts
title: Short comments, history in the docs
description: A file header is at most five lines with a pointer to its reference doc; inline comments explain only a non-obvious why; history, review findings and design essays go in the doc once.
status: stable
tags: [quality, process]
source: warehouse convention
generated: { by: human:migrate, at: 2026-08-26T00:00:00Z }
---

A file header is at most five lines with a pointer to its reference doc; inline comments explain only a non-obvious why; history, review findings and design essays go in the doc once.

## Why

One home for each explanation; code stays readable.

## Context

Header: what the file is plus a pointer to its reference section, five lines max. Inline comments only where a line is non-obvious. Prose moves to the reference doc, which must already hold every claim before the comment is deleted. Applied file by file as files are touched, never as a bulk rewrite.

Code headers grew into design essays and review logs that drifted from the code.
