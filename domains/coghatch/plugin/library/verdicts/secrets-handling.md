---
name: secrets-handling
kind: verdicts
description: No key file, service-account key download or secret in git, issues, shell history or scratch files; a secret travels stdin to process to secret store and is redacted on the way back.
status: accepted
tags: [convention, secrets, security]
date: 2026-09-03
---

# Secrets and identity

## Decision

- No key file, no service-account key download, no secret in git, in an issue comment, in a command line that
  reaches shell history, or in a scratch file.
- A secret travels stdin → process → secret store and is redacted on the way back out.
- Workload identity over keys wherever the platform offers it.
- A personal account email is never used as an identity in any artifact (test account, seed, config, doc); when an
  email is needed, ask which one.

## Why

Every copy of a secret outside the store is a leak waiting for a log line.
