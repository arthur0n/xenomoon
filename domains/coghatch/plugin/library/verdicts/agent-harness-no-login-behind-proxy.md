---
name: agent-harness-no-login-behind-proxy
kind: verdicts
description: For the pilot the agent harness ran with no login, bound to localhost and reached only through an authenticated tunnel, the same trust model as the old runtime.
status: superseded
tags: [agent-forge, auth]
date: 2026-09-21
source: forge D1
---

# Pilot harness: no login, reached through a proxy

## Context

The harness offers several auth modes. During the pilot the only user was the owner, and the old runtime already ran without its own login behind a tunnel.

## Decision

No login. The chat UI binds to 127.0.0.1 and is reached over an authenticated tunnel. Any identity passed to tools is a claim, shape-checked and never authenticated.

## Why

It matched the trust model already accepted for the old runtime and kept the pilot small. Superseded once staff needed access: login with a verified identity-provider subject.
