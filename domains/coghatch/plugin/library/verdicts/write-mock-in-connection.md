---
type: verdicts
title: The write mock lives in the connection
description: The ERP write mock lives in the connections package behind one env switch mapping record type to an existing id; it is a tool to turn on when a run must not write, not a phase every write path owes.
status: stable
amends: [writes-proven-by-one-real-run]
tags: [connections, testing]
source: platform D15
generated: { by: human:migrate, at: 2026-09-12T00:00:00Z }
---

The ERP write mock lives in the connections package behind one env switch mapping record type to an existing id; it is a tool to turn on when a run must not write, not a phase every write path owes.

## Why

- One place to mock, so no caller carries a flag.
- Flipping it is a config edit and a restart, never an image build.

## Context

The connection's generic create function answers a mock success (the configured existing internal id)
instead of posting when its own switch is on: one env value, a JSON map of record path to an existing id.
Absent means live. A record path missing from the map while the mock is on is a refusal, never a silent live
write. Reads stay live. One switch covers every process on the host. It is a tool, not a proof phase: new
write paths are still proven by one real run.

Both the pipelines and an agent's tools create ERP records. A dry-run flag in each caller would be two
switches that can disagree.
