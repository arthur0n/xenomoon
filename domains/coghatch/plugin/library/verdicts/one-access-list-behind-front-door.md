---
type: verdicts
title: One access list; the upstream app logs in behind the front door
description: The proxied agent app runs its own Entra login behind the access hub with no "assignment required", and one list, the access hub's ACL, decides who may enter; the identity provider only proves who the person is.
status: stable
supersedes: [two-gates-idp-assignment-plus-acl]
tags: [auth, security]
source: hub M21
generated: { by: human:migrate, at: 2026-10-02T00:00:00Z }
---

The proxied agent app runs its own Entra login behind the access hub with no "assignment required", and one list, the access hub's ACL, decides who may enter; the identity provider only proves who the person is.

## Why

The identity provider proves who the person is; the access list decides who may enter. Two lists with two
owners drift, and one list keeps onboarding in one place.

## Context

- The agent app runs its own Entra login with its own app registration, reached only through the access
  hub's proxy path. The access hub's Entra session makes that login silent.
- The app's registration has no "assignment required". The access hub ACL is the one list of who may
  enter; a grant admits the user to the whole app.
- The app's auth callback is just another proxied sub-path; no access hub route of its own.
- The identity the app verifies is held to the access hub user by the identity-cookie rule
  (`proxied-upstream-identity-matches-session`), not by a second list.

Sessions inside the agent app must be per employee, with identity verified by the identity provider at
the app, and the access hub as the only front door. The earlier design had two gates: "assignment
required" on the identity provider app (who may enter) plus the access hub ACL (which apps).
