---
name: oauth-bearer-tokens-risk-accepted
kind: verdicts
description: The access hub issues bearer tokens, not sender-constrained ones, because MCP clients support neither DPoP nor mTLS; the risk is accepted with compensating controls.
status: accepted
tags: [oauth, mcp, security]
date: 2026-09-03
source: hub M7
---

# Bearer tokens, risk accepted and compensated

## Context

ChatGPT presents `Authorization: Bearer` and supports neither DPoP nor mTLS. The MCP spec has no
sender-constraining; DPoP is only on the MCP roadmap. This blocks ASVS 10.4.14 and 10.3.5 (both L3).

## Decision

Issue bearer tokens, with compensating controls:

- short-lived, audience-bound access tokens (a token for one resource is inert on another);
- refresh-token rotation with revocation of the whole family on reuse;
- an ACL re-check at every tool call;
- identity assurance captured from the identity provider at sign-in.

## Why

There is no client that could present a sender-constrained token. Re-open when a client supports DPoP;
the OAuth library already ships the feature.
