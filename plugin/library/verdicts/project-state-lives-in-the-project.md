---
type: verdicts
title: project-state-lives-in-the-project
description: Everything written for one project, session logs included, lives under `<project>/.xenomoon/`; the install holds only domain-level state.
status: draft
tags: [hub, architecture, state]
generated: { by: human:arthur0n, at: 2026-11-09T13:45:55.841Z }
---

Everything written for one project, session logs included, lives under `<project>/.xenomoon/`; the install holds only domain-level state.

## Why

Tasks, pulse, promotions, autonomous state, codex runs and the lock already live project-side; only session logs and `.xm-run/` still land in the install.
With several profiles per install a shared `logs/` mixes projects and `/api/usage` reads them all.
Client data then never leaves the client repo.

## Context

#59 Facts §1 and §3 (config.js:767, connection.js:68, usage.js:81); #62 is the move.
Harvest 2026-11-09: logs sit in the install clone beside hermes-gateway.log, rtk-usage.log and caveman-gate.log.

## Rejected

Logs kept in the install and tagged by project: every reader filters, and a shared folder still leaks names across clients.

## Consequences

Every reader follows the path (recentSessions, usage, harvest-sessions, token-audit); promotions stay install-level because they are domain-level by design.
