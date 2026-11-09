---
type: verdicts
title: Automations use service identities
description: Connections used by automations run as machine service identities (for example an ERP machine-to-machine client), never an employee's identity; per-user access exists only where an employee's own data is touched.
status: stable
tags: [auth, connections, security]
source: platform D9
generated: { by: human:migrate, at: 2026-09-04T00:00:00Z }
---

Connections used by automations run as machine service identities (for example an ERP machine-to-machine client), never an employee's identity; per-user access exists only where an employee's own data is touched.

## Why

- An automation must not break when a person leaves or changes role.
- Audit trails show the automation, not a person who did not act.

## Context

Every automation connection uses a machine credential owned by the company. Per-person (delegated) access is
used only where an employee's own data is involved, such as their Microsoft 365 data through the access
hub's delegated consent.

Automations call the ERP and other systems unattended. Borrowing a person's credentials ties the automation
to that person's account and permissions.
