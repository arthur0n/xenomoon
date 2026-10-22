---
name: portal-strict-csp-boot-assets
kind: verdicts
description: The portal's assets are a fixed list read at boot and served by the access hub itself with no-cache plus a strong ETag, and both pages carry a strict self-only CSP with no inline script or style.
status: accepted
tags: [security, auth]
date: 2026-10-07
source: hub M24
---

# Portal assets from a boot-time list, strict CSP

## Context

The portal grew from one self-contained page into a page plus brand assets (logo, favicon, fonts, CSS,
JS). The rules were no framework, no build step, and no external asset.

## Decision

- Every asset is copied into the repo with its source recorded; fonts are self-hosted with their licence
  beside them. Nothing is fetched from a font CDN or another site at runtime.
- The composition root reads a fixed list of asset files once at boot; the router touches no filesystem.
  `/assets/<name>` answers a listed name with its bytes, a `Content-Type` from the list (never sniffed)
  and `nosniff`; any other name is 404. The name is matched on the raw request path before
  normalisation, so dot segments and percent-encodings never match.
- `Cache-Control: no-cache` plus a strong `ETag` from the bytes; a matching `If-None-Match` gets 304. No
  invented max-age.
- No inline script or style. Values from the API are written with `textContent`.
- CSP on both pages, with `X-Frame-Options: DENY`: `default-src 'none'; script-src 'self'; style-src 'self';
img-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none';
base-uri 'none'`. Proxied upstream responses are not touched.

## Why

Not adopted: data-URI assets (re-downloaded on every no-store page load), hosted web fonts (a third-party
request per visit), a hash-based CSP (every edit must match its hash).
