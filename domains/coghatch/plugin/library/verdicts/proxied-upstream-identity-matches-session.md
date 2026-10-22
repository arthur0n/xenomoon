---
name: proxied-upstream-identity-matches-session
kind: verdicts
description: When a proxied upstream sets its identity-token cookie, the front door reads the token's oid and refuses the cookie unless it equals the signed-in session's oid, so the upstream can never act as a different person than the access list and logs name.
status: accepted
amends: [proxied-upstream-cookies-bound-to-user]
tags: [auth, security]
date: 2026-10-06
source: hub M21
---

# The upstream's identity token must be the session user

## Context

Binding a cookie to the access hub session says nothing about who the upstream app thinks the user is.
User A could hold the access hub session while the app's own login completes as user B; the access hub
would tag B's token under A, the app would act as B, and the ACL and logs would name A. With one access
list, B need not even be on it.

## Decision

- The upstream entry names one listed cookie as its identity cookie (an Entra ID token).
- For a non-empty value of that cookie, after the other cookie rules and before tagging: split on `.`,
  require three segments, base64url-decode the payload, parse JSON, read `oid`. Refuse with `identity`
  unless `oid` equals the session's `oid`. An empty value (the app deleting its cookie) passes.
- Signature, issuer, audience and age are not verified here: the token comes from the trusted upstream
  over verified TLS, and the app verifies it itself on every request.
- The refusal log names neither `oid`.

## Why

`oid` is stable across apps in one tenant (`sub` is pairwise per app, so it would not match). Accepting the
split as a risk would break the attribution an audit tests. Comparing on the upstream side would need
identity headers, which are forbidden.
