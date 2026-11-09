---
type: verdicts
title: Connection layer stays in-process
description: The connection layer stays an in-process library rather than a hosted or self-hosted connector platform, because only one system exchanges tokens at run time; revisit when per-user connections or a second client-credentials system arrive.
status: stable
tags: [connections, oauth, deps]
source: connections 2026-09-11
generated: { by: human:migrate, at: 2026-09-11T00:00:00Z }
---

The connection layer stays an in-process library rather than a hosted or self-hosted connector platform, because only one system exchanges tokens at run time; revisit when per-user connections or a second client-credentials system arrive.

## Why

A platform adds a server, a database and a licence to solve a problem not yet present. Note: the first trigger later fired and was still solved in-process (the app mints user tokens; the package only makes calls).

## Context

Stay in-process. Of the systems used, one exchanges tokens at run time and it is built; the rest are static headers, cloud default credentials, or not web APIs. Revisit when any of these holds: end-user connections (a person authorises their own account), a connect-your-account UI needed by more than one consumer, a second standard client-credentials system (then adopt an OAuth library regardless), or more providers than one runbook edit per change absorbs. If revisited, prefer the Apache-2.0 option on licence and the broadest option on auth modes.

The question was whether a free, non-locked connector platform (auth flows, credential storage and refresh, signed requests, retries) should replace hand-written per-system code. Several exist as servers (source-available or open source) and one as a certified OAuth library.
