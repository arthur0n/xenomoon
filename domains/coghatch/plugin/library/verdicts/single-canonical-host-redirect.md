---
name: single-canonical-host-redirect
kind: verdicts
description: The access hub serves one canonical public host, taken from configuration, and answers every other host with a 308 to that host before any cookie is read or set, because a login started on another host loses its login cookie.
status: amended
tags: [auth, network, infra]
date: 2026-10-01
source: hub M20
---

# One canonical host, every other host redirected

## Context

A login started on any host other than the one registered with the identity provider fails: the login
cookie is set on the host the browser used, the provider redirects to the registered callback host, and
the cookie is not there. A Cloud Run service also answers on its default `run.app` host.

## Decision

- The canonical origin is derived from the configured redirect URI; no second copy of the host exists in
  code.
- A request whose `Host` is not canonical gets `308` to the same path and query on the canonical host,
  before any cookie is read or set. `Location` is built from the parsed path and query, never from the
  raw request target, so an absolute-form target cannot steer it away.
- `/health` is exempt. The router receives the canonical origin as an injected dependency, so test
  harnesses (whose `fetch` cannot set `Host`) are not redirected.

## Why

One host for every request removes the whole class of failure, and makes it structural rather than a
runbook note.

Amended: once a load balancer with restricted ingress closes the `run.app` host, the redirect is removed
(`public-host-global-load-balancer`).
