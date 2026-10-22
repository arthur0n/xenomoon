---
name: file-store-signed-read-urls
kind: verdicts
description: After each upload the file store mints a V4 signed read URL through the IAM signBlob API, with no downloaded key, valid 7 days to match the bucket lifecycle, so downstream readers need no credential.
status: accepted
amends: [file-store-gcs-json-api-no-sdk]
tags: [security, infra, agent-forge]
date: 2026-09-11
source: platform D18
---

# Signed read URLs from the file store

## Context

The agent needed to read attachments. A dedicated read tool would give the agent storage credentials.

## Decision

Each stored-file handle carries a V4 signed read URL and its expiry. The string-to-sign is built in a pure
module and signed through the IAM Credentials `signBlob` API with the same ADC token; no private key is ever
downloaded. Expiry is 7 days, the V4 maximum and the bucket lifecycle, so URL and file die together. The
signer is explicit config. The signer needs token-creator on itself and object-viewer on the bucket.
Signing failures are named separately from storage failures.

## Why

- Readers need no credential and no extra tool.
- Accepted risk: the URL is persisted in run history for its retention; a leak there already leaks the text.
