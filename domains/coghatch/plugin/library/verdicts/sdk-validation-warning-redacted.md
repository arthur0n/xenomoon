---
name: sdk-validation-warning-redacted
kind: verdicts
description: The generated SDK's schema-validation console warning, which can quote response body text, is replaced by one fixed line through a console.warn filter installed by the only module that builds the SDK client.
status: accepted
tags: [security, observability, agent-forge]
date: 2026-10-20
source: platform D33
---

# Redact the SDK's validation warning

## Context

The generated SDK prints a direct `console.warn` when a response fails its schema, quoting received values.
No option, version or fork patch stops it; the clean fix lives in the code generator.

## Decision

The adapter that builds the SDK client installs, once per process, a filter on `console.warn`: a call whose
first argument starts with `Failed to validate.` becomes one fixed line; every other call passes unchanged.
The filter is idempotent and re-wraps a `warn` replaced later. Field paths are not kept, since the message
beside them quotes the value.

## Why

- Agent text must not reach logs.
- A process-wide patch of a global is a workaround the owner approved; patching and republishing the SDK was
  a publish chain in two repos for one line.
