---
name: attachment-type-sniffed-when-generic
kind: verdicts
description: When a mail declares a generic binary type for an attachment, the receiver detects PDF, PNG or JPEG from the first bytes and carries that type; a specific declared type is believed, and the extension is never used.
status: accepted
amends: [inbound-routing-by-address-in-pipeline]
tags: [email]
date: 2026-09-21
source: platform D20
---

# Correct a generic attachment type from its bytes

## Context

The same PDF produced an order when declared `application/pdf` and a question when declared
`application/octet-stream`. The receiver is the only component that holds the bytes.

## Decision

For a generic declared type (`application/octet-stream`, `binary/octet-stream`), the receiver checks magic
bytes (`%PDF-`, PNG signature, JPEG signature) and uses the detected type. A specific declared type is
believed even when wrong. An unrecognised generic payload keeps its declared type. ZIP/OOXML is not sniffed
(the signature says zip, not spreadsheet). A mail with an empty body is valid if it has an attachment.

## Why

- The type becomes a fact about the bytes when the mail gave none.
- Extensions are user-editable and never trusted.
