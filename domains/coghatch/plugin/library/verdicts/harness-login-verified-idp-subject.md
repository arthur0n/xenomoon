---
name: harness-login-verified-idp-subject
kind: verdicts
description: The harness runs OIDC login against Entra — identity is a verified subject (the object id), admin is a database row, machine callers present app-only client-credentials tokens, and the tool identity is derived from the verified subject.
status: amended
supersedes: [agent-harness-no-login-behind-proxy]
amends: [tool-identity-is-attribution-until-login, pipeline-identity-is-service-name]
tags: [agent-forge, auth, security]
date: 2026-10-01
source: forge A37
---

# Login with a verified identity-provider subject

## Context

Staff needed access beyond the owner, so the claimed identity had to become a verified one.

## Decision

Staff reach the chat UI only through the access hub, whose access list decides who may enter; the harness runs upstream's OIDC mode with its own app registration and the subject is the immutable object id. Roles: employee and admin; admin is held in the harness database, not in code, config or identity-provider groups. Machine callers present client-credentials tokens: a bearer must be app-only and carry the machine app role, a cookie token must not; an app token is never admin. The user passed to tools is derived from the verified subject on every creation path; a differing supplied value is refused. Employees list their own sessions; admins read all; mutations stay creator-only.

## Why

The identity provider proves who the person is; the access list decides who may enter; nothing downstream trusts a claim.
