---
type: verdicts
title: Correct a generic attachment type from its bytes
description: When a mail declares a generic binary type for an attachment, the receiver detects PDF, PNG or JPEG from the first bytes and carries that type; a specific declared type is believed, and the extension is never used.
status: stable
amends: [inbound-routing-by-address-in-pipeline]
tags: [email]
source: platform D20
generated: { by: human:migrate, at: 2026-09-21T00:00:00Z }
---

When a mail declares a generic binary type for an attachment, the receiver detects PDF, PNG or JPEG from the first bytes and carries that type; a specific declared type is believed, and the extension is never used.

## Why

- The type becomes a fact about the bytes when the mail gave none.
- Extensions are user-editable and never trusted.

## Context

For a generic declared type (`application/octet-stream`, `binary/octet-stream`), the receiver checks magic
bytes (`%PDF-`, PNG signature, JPEG signature) and uses the detected type. A specific declared type is
believed even when wrong. An unrecognised generic payload keeps its declared type. ZIP/OOXML is not sniffed
(the signature says zip, not spreadsheet). A mail with an empty body is valid if it has an attachment.

The same PDF produced an order when declared `application/pdf` and a question when declared
`application/octet-stream`. The receiver is the only component that holds the bytes.
