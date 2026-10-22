---
name: two-gates-idp-assignment-plus-acl
kind: verdicts
description: Access was gated twice, by "assignment required" on the identity provider app (IT decides who may enter) and by the access hub ACL (which apps), so each owner answered one question.
status: superseded
tags: [auth, security]
date: 2026-08-30
source: hub D5
---

# Two gates: identity-provider assignment plus the ACL

## Context

Two parties had a say: the identity provider's admins (who belongs) and the access hub operator (which
agents a person may use).

## Decision

Two gates. Entra "assignment required" on the app decides who may enter; the access hub ACL decides which
agents and tools each person may use.

## Why

Two owners, two questions.

Superseded by `one-access-list-behind-front-door`: one list, the access hub ACL, decides who may enter;
the identity provider only proves identity.
