---
type: verdicts
title: Front door first, identity-provider request second
description: Build and deploy the front door before requesting the identity-provider app registration, because a change to its URLs after the request would mean a second round with IT.
status: stable
tags: [auth, infra]
source: hub D9
generated: { by: human:migrate, at: 2026-08-30T00:00:00Z }
---

Build and deploy the front door before requesting the identity-provider app registration, because a change to its URLs after the request would mean a second round with IT.

## Why

A URL change after the request would cost a second IT round.

## Context

Build and deploy the access hub first, so its callback URLs are final, then file the app registration
request.

The identity provider's app registration is owned by IT, and every change to redirect URIs needs another
request to them.
