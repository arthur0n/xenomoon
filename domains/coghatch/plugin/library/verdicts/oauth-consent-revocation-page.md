---
type: verdicts
title: User-facing consent and revocation page in the MVP
description: A minimal page listing the user's own OAuth consents, each revocable along with its live tokens, ships in the MVP because ASVS L2 requires it.
status: stable
tags: [oauth, auth, security]
source: hub M5
generated: { by: human:migrate, at: 2026-09-03T00:00:00Z }
---

A minimal page listing the user's own OAuth consents, each revocable along with its live tokens, ships in the MVP because ASVS L2 requires it.

## Why

Deferring it would make the MVP "Level 2 except two items", which defeats choosing a standard. The parts
already exist (the portal, the session, grants stored as rows), so the cost is small.

## Context

A page for signed-in users that lists their own granted consents (client, resource, date), each with a
revoke action that also revokes their live tokens. Own grants only. Minimal: a list and a delete path.

The OAuth surface was measured against ASVS V10 Level 2. Items 10.4.9 (revoke tokens) and 10.7.3
(manage consents) are both Level 2.
