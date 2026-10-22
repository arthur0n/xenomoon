---
name: erp-query-client-read-only
kind: verdicts
description: The ERP query client refuses anything that is not a bare read-only SELECT, buffers all pages before returning, and parses the ERP's date text without the platform Date object.
status: accepted
tags: [connections, security]
date: 2026-09-19
source: warehouse netsuite-suiteql
---

# ERP query client is read-only

## Context

The mounted ERP credential may have write rights on the ERP side.

## Decision

The client accepts only a bare SELECT; pages are buffered to a full result or a throw (no partial export); dates in the account's display format are converted by string parsing, never through Date (time-zone unsafe). Error previews must never throw while rendering.

## Why

The library must be incapable of using the credential for anything but a read.
