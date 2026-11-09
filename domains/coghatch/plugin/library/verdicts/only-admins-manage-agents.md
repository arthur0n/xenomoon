---
type: verdicts
title: Only admins manage agents
description: Only an admin creates, edits, deletes or composes an agent; everyone else only uses saved agents, because any user could otherwise build an agent with unguarded write tools.
status: stable
tags: [agent-forge, auth, security]
source: forge A48
generated: { by: human:migrate, at: 2026-10-10T00:00:00Z }
---

Only an admin creates, edits, deletes or composes an agent; everyone else only uses saved agents, because any user could otherwise build an agent with unguarded write tools.

## Why

Write access to business systems must not be one prompt away for every user.

## Context

Create, edit and delete of agents are admin-only. A non-admin is refused an inline agent spec on session create, get-or-create and agent change, and a turn on an existing inline session. The UI does not offer these to non-admins.

Any signed-in user could create an agent and give it the ERP write tools, which never pause for approval.
