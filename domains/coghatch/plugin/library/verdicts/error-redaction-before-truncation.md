---
name: error-redaction-before-truncation
kind: verdicts
description: Error redaction in the connections package is value-aware and runs before truncation: every thrown error scrubs secret patterns and the exact credential values used, on every path that renders a vendor body.
status: accepted
tags: [security, connections, secrets]
date: 2026-09-14
source: platform D24
---

# Redact by value, before truncating

## Context

A security review found that a vendor body echoing a credential as a JSON field was not matched by any
pattern, that a JWT scrub ran after the 500-character cut (so a cut JWT survived), and that a 2xx body failing
validation was truncated but never redacted.

## Decision

Every error the package throws scrubs (i) the known secret patterns and (ii) the exact credential values the
request used (bearer token, API key, signed assertion). Every scrub runs before the body preview is cut. The
rule covers 2xx validation failures too, not only non-2xx errors. Consumers never re-scrub.

## Why

- Truncation is not redaction.
- One place to get it right, so consumers pass error text through unchanged.
