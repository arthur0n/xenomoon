---
name: oidc-client-library-certified-rp
kind: verdicts
description: The access hub's sign-in uses openid-client, an OpenID-certified, vendor-neutral relying-party library, so the front door can be reused with any identity provider.
status: accepted
tags: [auth, deps]
date: 2026-08-30
source: hub D2
---

# openid-client as the relying-party library

## Context

The access hub signs users in with OIDC against Entra. A vendor SDK would tie the code to one identity
provider.

## Decision

Use `openid-client`, an OpenID-certified relying-party library, not a vendor-specific SDK.

## Why

Certification means the protocol details are checked by someone else, and a vendor-neutral client keeps
the front door reusable with any identity provider.
