---
name: oauth-refusal-logging-closed-vocabulary
kind: verdicts
description: Every token-endpoint and authorize refusal is logged as a closed RFC code plus a closed reason word mapped from the library's own literal, never a raw library string or token, so failures are diagnosable without leaking.
status: accepted
tags: [oauth, observability, security]
date: 2026-09-05
source: hub M16
---

# OAuth refusals logged with a closed reason word

## Context

Token-endpoint refusals logged only `POST /oauth/token 400`. The reason existed only inside the OAuth
library's `grant.error` event, which nothing subscribed to. A consent that "did nothing" left no trace of
where its redirect pointed.

## Decision

- Subscribe to the library's `grant.error`, `server_error`, `grant.revoked`, `authorization.success` and
  `authorization.error` events from the composition root, through one exported wiring function.
- Log one line per refusal: `token refused - <code>/<reason>`. `<code>` is the RFC error from a closed set;
  `<reason>` is the library's literal matched whole-string against a closed table of about thirty words.
  Anything else is `other`.
- Context is the user id only. Never the token, the client body or a raw library string.
- `server_error` gets a fixed line with no detail. Authorize outcomes log only client and redirect hosts.
- Each listener runs inside a try/catch, because the library emits synchronously before responding: a
  throwing listener would turn a 400 into a 500.

## Why

Log messages are fixed text and reason words, never upstream messages. Read which error field carries the
literal per error class from the installed library, not by assumption: reading the wrong field collapsed
every `invalid_grant` onto one constant.
