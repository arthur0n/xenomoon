---
name: sandbox-image-digest-pinned-probe-before-push
kind: verdicts
description: The sandbox image is a small digest-pinned base with a fixed tool list; CI probes the built image and runs the sandbox contract suite before pushing, and the VM pre-pulls the digest before switching to it.
status: accepted
tags: [agent-forge, sandbox, ci]
date: 2026-09-22
source: forge A8
---

# Sandbox image: pinned, probed, then pushed

## Context

The harness tells the model which tools the sandbox has. The provider never pulls an image that is already present, and the settings check only reads the local image.

## Decision

The sandbox image is built from a digest-pinned slim base with a short apt and pip list and nothing else. CI builds it locally, runs a probe script for every advertised tool and then the provider contract suite against the same tag; only then is it pushed and its digest printed. The deploy names the digest, and the host pulls it before the settings are switched.

## Why

An image that fails the probe never reaches the registry, and the advertised tool list always matches what the image holds.
