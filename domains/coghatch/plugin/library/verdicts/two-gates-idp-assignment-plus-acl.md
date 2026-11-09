---
type: verdicts
title: Two gates: identity-provider assignment plus the ACL
description: Access was gated twice, by "assignment required" on the identity provider app (IT decides who may enter) and by the access hub ACL (which apps), so each owner answered one question.
status: deprecated
tags: [auth, security]
source: hub D5
generated: { by: human:migrate, at: 2026-08-30T00:00:00Z }
---

Access was gated twice, by "assignment required" on the identity provider app (IT decides who may enter) and by the access hub ACL (which apps), so each owner answered one question.

## Why

Two owners, two questions.

Superseded by `one-access-list-behind-front-door`: one list, the access hub ACL, decides who may enter;
the identity provider only proves identity.

## Context

Two gates. Entra "assignment required" on the app decides who may enter; the access hub ACL decides which
agents and tools each person may use.

Two parties had a say: the identity provider's admins (who belongs) and the access hub operator (which
agents a person may use).
