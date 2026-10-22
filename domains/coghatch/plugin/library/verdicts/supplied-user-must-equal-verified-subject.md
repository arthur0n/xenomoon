---
name: supplied-user-must-equal-verified-subject
kind: verdicts
description: Under login a supplied session user must equal the verified subject (else 400); only upstream's local no-auth mode keeps a supplied value, and the deployed system runs with login only.
status: accepted
amends: [harness-login-verified-idp-subject]
tags: [agent-forge, auth]
date: 2026-10-04
source: forge A42
---

# A supplied user must equal the verified subject

## Context

Upstream's standalone mode has one fixed subject for every caller, so there is nothing to compare a claim with.

## Decision

In standalone mode a valid supplied user is kept as the session user. In login modes a differing claim is refused. A stored session user can never change. The deployed system runs with login on; standalone is for local use only.

## Why

One rule per mode, and no unverified identity in production.
