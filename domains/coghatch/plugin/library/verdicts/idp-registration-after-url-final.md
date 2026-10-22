---
name: idp-registration-after-url-final
kind: verdicts
description: Build and deploy the front door before requesting the identity-provider app registration, because a change to its URLs after the request would mean a second round with IT.
status: accepted
tags: [auth, infra]
date: 2026-08-30
source: hub D9
---

# Front door first, identity-provider request second

## Context

The identity provider's app registration is owned by IT, and every change to redirect URIs needs another
request to them.

## Decision

Build and deploy the access hub first, so its callback URLs are final, then file the app registration
request.

## Why

A URL change after the request would cost a second IT round.
