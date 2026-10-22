---
name: only-admins-manage-agents
kind: verdicts
description: Only an admin creates, edits, deletes or composes an agent; everyone else only uses saved agents, because any user could otherwise build an agent with unguarded write tools.
status: accepted
tags: [agent-forge, auth, security]
date: 2026-10-10
source: forge A48
---

# Only admins manage agents

## Context

Any signed-in user could create an agent and give it the ERP write tools, which never pause for approval.

## Decision

Create, edit and delete of agents are admin-only. A non-admin is refused an inline agent spec on session create, get-or-create and agent change, and a turn on an existing inline session. The UI does not offer these to non-admins.

## Why

Write access to business systems must not be one prompt away for every user.
