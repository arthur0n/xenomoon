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

- Every log a project's session or server writes moves together under <project>/.xenomoon/logs/: the session NDJSON, the Hermes gateway log, the caveman gate log and the rtk usage log; the install keeps no per-project log; a hook in a terminal session without the server has no XENOMOON_LOG_DIR and falls back to TMPDIR, so only server-spawned sessions are co-located. Owner, 2026-11-11, on the four logs moving together: "yes" (confirmed "1 yes" at gate 1 of /change 62).
- `.xm-run/` stays in the install: it holds a pid and the server stdout per port (`.xm-run/ui.<port>.pid`, `.log`, #63), owned by start_server, stop_server and the hub, and it is not project data.
