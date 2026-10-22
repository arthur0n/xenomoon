---
name: agent-harness-login-conf-switch
kind: verdicts
description: The agent harness's OIDC login is a conf switch: present client id turns it on with the client secret read from Secret Manager, absent means login off, and the boot script refuses any half-set combination.
status: accepted
tags: [auth, secrets, infra]
date: 2026-10-07
source: platform D36
---

# Harness login is a conf switch

## Context

The agent harness supports OIDC login against Microsoft Entra, and turning it on must be safe and reversible.

## Decision

The conf key for the OIDC client id is the switch. Absent: the boot script writes no OIDC lines and the
harness runs with login off. Set: boot requires the machine app role, reads the client secret from Secret
Manager, and writes issuer (built from the tenant id), client id, secret, a fixed user-reference claim (`oid`)
and the role. Refused at boot, by key name, with nothing written and the secret not read: an empty client id;
a role set while the switch is off; a missing role or a malformed tenant id while it is on. Admin is held in
the harness database, not conf. Rollback is deleting the lines and restarting.

## Why

- Login on is a conf edit plus a restart, never a code change; an ordinary roll never turns it on.
- Rejected: the client secret in the conf; every secret lives in Secret Manager.
