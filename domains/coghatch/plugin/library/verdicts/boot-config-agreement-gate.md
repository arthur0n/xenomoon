---
name: boot-config-agreement-gate
kind: verdicts
description: The VM boot script and the app's config loader must agree, and the gate proves it by behaviour: it runs the real boot script on a conf holding every required key and loads the env file it writes with the real config loader.
status: accepted
tags: [testing, ci, infra]
date: 2026-10-10
source: platform D39
---

# Boot script and config agree, proven by running both

## Context

A review found that deleting a required key from the boot script passed the gate and failed only at VM boot.
Some keys are read through helpers that build the name, which a text scan cannot see.

## Decision

A gate test runs the real `boot.sh` in an environment holding only `PATH` and the conf dir, on a conf built
from its required-key loop, then calls the real config loader on the env file it writes; that must succeed. A
key missing from the writer is refused by name; a key dropped from the loop makes the boot stop under
`set -u`. The example env file must name every required key. A new required key lands in config, both boot
lists and the example in one diff.

## Why

- Chosen over a text scan of the config file: behaviour is what the VM runs.
