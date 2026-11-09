---
type: verdicts
title: File store on the GCS JSON API, no SDK
description: The live file store uses the GCS JSON API over fetch with an ADC token, no storage SDK, into a temporary bucket with a 7-day delete lifecycle and create-only IAM, objects named by sha256 of their bytes.
status: stable
tags: [infra, deps, security]
source: platform D18
generated: { by: human:migrate, at: 2026-09-06T00:00:00Z }
---

The live file store uses the GCS JSON API over fetch with an ADC token, no storage SDK, into a temporary bucket with a 7-day delete lifecycle and create-only IAM, objects named by sha256 of their bytes.

## Why

- Zero new dependencies; every byte of the call sits in the adapter; retries stay with the step.
- Create-only cannot overwrite, so one run cannot replace another's file.
- Re-open the SDK choice when a second storage capability lands.

## Context

Upload with one `POST` to the GCS upload endpoint with `ifGenerationMatch=0`, bearer from
`google-auth-library` ADC with the narrowest writing scope. Object name = sha256 of the bytes / filename, so a
412 means "already stored". 429 and 5xx retry; other non-2xx are non-retriable with a message naming the
failure class (never the bytes, type value or token). The bucket is temporary by name, attachments only,
lifecycle delete after 7 days, uniform access, public access prevented; writers hold create-only roles. A
persistent file needs a new bucket.

Attachments must outlive a run but not much longer. The storage SDK would be a new runtime dependency.
