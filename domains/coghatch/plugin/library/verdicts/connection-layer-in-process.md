---
type: verdicts
title: Connections stay in-process
description: The connection layer stays in-process: no connection platform (Nango, OpenConnector, superglue) and no OAuth library; the connections package hand-writes each system's auth on one shared transport.
status: stable
tags: [connections, oauth, auth, deps]
source: platform D25
generated: { by: human:migrate, at: 2026-09-11T00:00:00Z }
---

The connection layer stays in-process: no connection platform (Nango, OpenConnector, superglue) and no OAuth library; the connections package hand-writes each system's auth on one shared transport.

## Why

- The platforms replace working code and add a service, a database, credentials outside Secret Manager and
  a maintained fork per custom provider; Nango's free self-host targets hobby projects.

## Context

No connection platform and no OAuth library. Each system's auth is hand-written on the shared transport.
Hardening: per-request timeouts via `AbortSignal`, `Retry-After` on 429, a vendor-neutral token cache and 401
replay in `shared/`, a static-credential helper, and value-aware redaction. A one-time brand consent that
yields a static token is not per-person consent. A second client-credentials system (Microsoft Entra
app-only) was added by hand: one token request and a cache. Re-open on: per-person connections with consent
screens; a connect-your-account UI for more than one consumer; third-party OAuth needing more than one
runbook edit per change. Preference if re-opened: OpenConnector (Apache-2.0), or Nango for auth-mode breadth.

The generic parts (retries, typed errors, scrub, token cache, bearer factory with one 401 replay) were about
570 lines already built. The systems in reach were one OAuth client-credentials system, static-header APIs,
Google ADC and SMTP.
