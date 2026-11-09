---
type: verdicts
title: Machine-off means the whole loop is in the cloud
description: Running with the machine off means the whole loop lives in the cloud, including the restart signal; a local dispatcher that dies with the laptop does not count.
status: stable
tags: [infra, workflow-engine]
source: warehouse convention
generated: { by: human:migrate, at: 2026-08-23T00:00:00Z }
---

Running with the machine off means the whole loop lives in the cloud, including the restart signal; a local dispatcher that dies with the laptop does not count.

## Why

A loop is only as available as its least available part.

## Context

Every part of a scheduled loop (schedule, dispatch, retry and restart) runs in the cloud before it is called unattended.

A design called itself machine-independent while its trigger ran on a laptop.
