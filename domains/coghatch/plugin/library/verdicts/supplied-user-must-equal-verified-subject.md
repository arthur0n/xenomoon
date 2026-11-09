---
type: verdicts
title: A supplied user must equal the verified subject
description: Under login a supplied session user must equal the verified subject (else 400); only upstream's local no-auth mode keeps a supplied value, and the deployed system runs with login only.
status: stable
amends: [harness-login-verified-idp-subject]
tags: [agent-forge, auth]
source: forge A42
generated: { by: human:migrate, at: 2026-10-04T00:00:00Z }
---

Under login a supplied session user must equal the verified subject (else 400); only upstream's local no-auth mode keeps a supplied value, and the deployed system runs with login only.

## Why

One rule per mode, and no unverified identity in production.

## Context

In standalone mode a valid supplied user is kept as the session user. In login modes a differing claim is refused. A stored session user can never change. The deployed system runs with login on; standalone is for local use only.

Upstream's standalone mode has one fixed subject for every caller, so there is nothing to compare a claim with.
