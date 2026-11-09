---
type: verdicts
title: One canonical host, every other host redirected
description: The access hub serves one canonical public host, taken from configuration, and answers every other host with a 308 to that host before any cookie is read or set, because a login started on another host loses its login cookie.
status: stable
tags: [auth, network, infra]
source: hub M20
generated: { by: human:migrate, at: 2026-10-01T00:00:00Z }
---

The access hub serves one canonical public host, taken from configuration, and answers every other host with a 308 to that host before any cookie is read or set, because a login started on another host loses its login cookie.

## Why

One host for every request removes the whole class of failure, and makes it structural rather than a
runbook note.

Amended: once a load balancer with restricted ingress closes the `run.app` host, the redirect is removed

## Context

- The canonical origin is derived from the configured redirect URI; no second copy of the host exists in
  code.
- A request whose `Host` is not canonical gets `308` to the same path and query on the canonical host,
  before any cookie is read or set. `Location` is built from the parsed path and query, never from the
  raw request target, so an absolute-form target cannot steer it away.
- `/health` is exempt. The router receives the canonical origin as an injected dependency, so test
  harnesses (whose `fetch` cannot set `Host`) are not redirected.

A login started on any host other than the one registered with the identity provider fails: the login
cookie is set on the host the browser used, the provider redirects to the registered callback host, and
the cookie is not there. A Cloud Run service also answers on its default `run.app` host.
(`public-host-global-load-balancer`).
