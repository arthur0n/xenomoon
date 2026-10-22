---
name: per-user-mail-access-separate-app-registration
kind: verdicts
description: Per-user mailbox access for agents uses a dedicated Entra app registration with delegated, user-consentable permissions accepted by each user in a Connect popup; the login app never gets mail permissions, and the connections package only makes the calls with a token it is given.
status: accepted
tags: [agent-forge, auth, oauth, email, connections]
date: 2026-10-21
source: forge A57
---

# Per-user mail access through a separate app

## Context

Agents needed to read and send mail as the asking user. Adding mail permissions to the login app would grant them to every user at sign-in.

## Decision

Two app registrations. The login app stays as it is. A second, mail-only, single-tenant app carries delegated permissions (read mail, send mail, read calendars, read contacts, offline access), each user-consentable; no tenant-wide admin consent. Each user consents in the Connect popup; a user who never connects has granted nothing. If the tenant blocks user consent, that is a stop, not an admin grant. The harness mints and refreshes the user's token; the connections package takes it per call and never acquires one.

## Why

Consent is explicit and per person, and the login path stays free of data permissions.
