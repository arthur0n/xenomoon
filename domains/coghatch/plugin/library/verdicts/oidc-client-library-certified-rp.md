---
type: verdicts
title: openid-client as the relying-party library
description: The access hub's sign-in uses openid-client, an OpenID-certified, vendor-neutral relying-party library, so the front door can be reused with any identity provider.
status: stable
tags: [auth, deps]
source: hub D2
generated: { by: human:migrate, at: 2026-08-30T00:00:00Z }
---

The access hub's sign-in uses openid-client, an OpenID-certified, vendor-neutral relying-party library, so the front door can be reused with any identity provider.

## Why

Certification means the protocol details are checked by someone else, and a vendor-neutral client keeps
the front door reusable with any identity provider.

## Context

Use `openid-client`, an OpenID-certified relying-party library, not a vendor-specific SDK.

The access hub signs users in with OIDC against Entra. A vendor SDK would tie the code to one identity
provider.
