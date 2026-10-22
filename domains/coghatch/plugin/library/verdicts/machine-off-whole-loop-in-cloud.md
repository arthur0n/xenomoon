---
name: machine-off-whole-loop-in-cloud
kind: verdicts
description: Running with the machine off means the whole loop lives in the cloud, including the restart signal; a local dispatcher that dies with the laptop does not count.
status: accepted
tags: [infra, workflow-engine]
date: 2026-08-23
source: warehouse convention
---

# Machine-off means the whole loop is in the cloud

## Context

A design called itself machine-independent while its trigger ran on a laptop.

## Decision

Every part of a scheduled loop (schedule, dispatch, retry and restart) runs in the cloud before it is called unattended.

## Why

A loop is only as available as its least available part.
