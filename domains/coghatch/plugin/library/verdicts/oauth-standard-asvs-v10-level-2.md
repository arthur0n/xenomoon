---
name: oauth-standard-asvs-v10-level-2
kind: verdicts
description: The access hub's OAuth surface is measured against OWASP ASVS 5.0 chapter V10 at Level 2 in full; FAPI 2.0 is out because it cannot coexist with MCP public clients.
status: accepted
tags: [auth, oauth, mcp, security]
date: 2026-09-03
source: hub M1
---

# OAuth surface measured against ASVS V10 Level 2

## Context

The access hub is an OAuth/OIDC front door and MCP authorization server in front of a private agent app.
"Enterprise grade" cannot be asserted by a design about itself. It needs an outside checklist, checked
item by item, with the failures written down.

## Decision

The standard is OWASP ASVS 5.0 chapter V10 at Level 2, in full, plus the Level 3 items that cost nothing,
plus the identity assurance the identity provider gives at sign-in. Every control names its ASVS item.

## Why

- A checklist someone else wrote is the only honest meaning of "enterprise grade".
- FAPI 2.0 (the higher, certifiable profile) was evaluated and is structurally unreachable: it requires
  client authentication by mTLS or `private_key_jwt`, while MCP requires public clients and Client ID
  Metadata Documents forbid client secrets. The two specs are disjoint on client authentication, so the
  gap is not a budget question.
- Choosing a standard means later shortcuts ("L2 except two items") are visible as failures.
