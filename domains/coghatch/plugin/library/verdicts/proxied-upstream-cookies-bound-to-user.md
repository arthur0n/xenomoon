---
name: proxied-upstream-cookies-bound-to-user
kind: verdicts
description: Cookies from a proxied upstream on the same origin are accepted only by name, forced onto the upstream's path with Secure and HttpOnly, and bound to the front-door user by an HMAC tag that is verified before any cookie goes back upstream.
status: amended
tags: [auth, security, network]
date: 2026-10-02
source: hub M21
---

# Proxied upstream cookies, path-scoped and bound to the user

## Context

The access hub and the proxied agent app share one origin. The app needs its own cookies (`oauth_state`,
`id_token`) to cross the proxy both ways, without colliding with or shadowing the access hub's cookies,
and without one user's cookie being replayed for another.

## Decision

- Upstream `Set-Cookie` is dropped unless its name is on the entry's list (validated at boot, never an
  access hub cookie name, no `__Host-`/`__Secure-` prefix). Refused if it carries `Domain`, lacks `Secure` or
  lacks `HttpOnly`, or its value has a non cookie-octet. The access hub rewrites `Path=/a/<app>/; Secure;
HttpOnly` first.
- The value becomes `<value>.<tag>`: base64url HMAC-SHA256 over a new purpose string, the session user's
  id, the cookie name and the value, length-prefixed, with the session signing key. The user id is the
  one of the request that carried the response, not re-read later.
- Inbound, the access hub rebuilds `Cookie` from listed names only, forwarding the first occurrence whose
  tag verifies for the current session, untagged. Nothing else goes upstream.
- Tagged cookies over the user agent's 4096-octet name+value limit are refused (`oversize`), logged
  without name or value.
- Login and logout clear the listed cookies with expired `Set-Cookie`s. Clearing is hygiene; the tag
  check is the guarantee. Not `Clear-Site-Data`, which cannot scope by path or name.

## Why

A path rewrite alone stops replacement but not shadowing or `Domain` reach; the name list and `Domain`
refusal close those, and the tag makes account switches and delayed responses safe.
Accepted: the access hub sees every carried cookie in clear, the trust it already holds as the front door.
