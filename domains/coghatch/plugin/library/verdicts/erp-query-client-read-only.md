---
type: verdicts
title: ERP query client is read-only
description: The ERP query client refuses anything that is not a bare read-only SELECT, buffers all pages before returning, and parses the ERP's date text without the platform Date object.
status: stable
tags: [connections, security]
source: warehouse netsuite-suiteql
generated: { by: human:migrate, at: 2026-09-19T00:00:00Z }
---

The ERP query client refuses anything that is not a bare read-only SELECT, buffers all pages before returning, and parses the ERP's date text without the platform Date object.

## Why

The library must be incapable of using the credential for anything but a read.

## Context

The client accepts only a bare SELECT; pages are buffered to a full result or a throw (no partial export); dates in the account's display format are converted by string parsing, never through Date (time-zone unsafe). Error previews must never throw while rendering.

The mounted ERP credential may have write rights on the ERP side.
