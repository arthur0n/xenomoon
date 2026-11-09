---
type: verdicts
title: Agent harness SDK only in its adapter
description: The agent harness's TrueForge SDK is an exact-pinned runtime dependency imported only under its own adapter behind a contract; the first proof of a pipeline calling an agent used a real workflow function on a hand-sent event.
status: stable
tags: [agent-forge, deps, workflow-engine]
source: platform D32
generated: { by: human:migrate, at: 2026-09-28T00:00:00Z }
---

The agent harness's TrueForge SDK is an exact-pinned runtime dependency imported only under its own adapter behind a contract; the first proof of a pipeline calling an agent used a real workflow function on a hand-sent event.

## Why

- It is the platform's own runtime, not an external-system SDK, but still confined to one adapter.

## Context

A proof workflow function on an event nothing sends automatically, triggered by hand by the operator, calls
the harness over the compose network. Session creation and turn polling are separate steps, so a retried wait
never starts a second turn. `@truefoundry/trueforge-sdk` joins the dependency allow-list as an exact pin and
is importable only under the harness adapter (scanner and lint both enforce it). SDK errors are rethrown under
a constant with the SDK error as `cause`. Poll interval, per-request timeout and stored-text limit stay
constants; the operator's one knob is the turn deadline. Get-or-create session is one request carrying
metadata, passed through the SDK's own additional-body option rather than a fork or cast.

The claim to prove was that a pipeline step can call an agent hosted on the agent harness, so the caller had
to be the real one, not a script inside the harness.
