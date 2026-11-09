---
type: verdicts
title: Signed read URLs from the file store
description: After each upload the file store mints a V4 signed read URL through the IAM signBlob API, with no downloaded key, valid 7 days to match the bucket lifecycle, so downstream readers need no credential.
status: stable
amends: [file-store-gcs-json-api-no-sdk]
tags: [security, infra, agent-forge]
source: platform D18
generated: { by: human:migrate, at: 2026-09-11T00:00:00Z }
---

After each upload the file store mints a V4 signed read URL through the IAM signBlob API, with no downloaded key, valid 7 days to match the bucket lifecycle, so downstream readers need no credential.

## Why

- Readers need no credential and no extra tool.
- Accepted risk: the URL is persisted in run history for its retention; a leak there already leaks the text.

## Context

Each stored-file handle carries a V4 signed read URL and its expiry. The string-to-sign is built in a pure
module and signed through the IAM Credentials `signBlob` API with the same ADC token; no private key is ever
downloaded. Expiry is 7 days, the V4 maximum and the bucket lifecycle, so URL and file die together. The
signer is explicit config. The signer needs token-creator on itself and object-viewer on the bucket.
Signing failures are named separately from storage failures.

The agent needed to read attachments. A dedicated read tool would give the agent storage credentials.
