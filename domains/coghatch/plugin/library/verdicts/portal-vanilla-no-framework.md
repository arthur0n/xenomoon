---
type: verdicts
title: Vanilla portal over the API
description: The access hub portal is vanilla HTML and JS over its own JSON API, with React or any framework only when a real UI need appears, because no component should exist without a requirement.
status: stable
tags: [auth]
source: hub D6
generated: { by: human:migrate, at: 2026-08-30T00:00:00Z }
---

The access hub portal is vanilla HTML and JS over its own JSON API, with React or any framework only when a real UI need appears, because no component should exist without a requirement.

## Why

No component without a requirement. A small page needs no framework, and fewer dependencies mean a
smaller supply chain on the front door.

## Context

The portal is plain HTML and JavaScript calling the access hub's `/api/*` endpoints. React (or another
framework) comes in only when a concrete UI need requires it. No build step.

The access hub needs a small signed-in page that lists what a user may open. Frameworks bring a build step
and dependencies.
