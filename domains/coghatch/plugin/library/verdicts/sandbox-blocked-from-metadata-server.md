---
type: verdicts
title: Sandboxes cannot reach the metadata server
description: Sandbox containers are cut off from the cloud metadata server by a host firewall rule (DNS excepted) and Docker run flags are refused, because model-written code could otherwise act as the VM identity.
status: stable
tags: [agent-forge, sandbox, security, network]
source: forge A13
generated: { by: human:migrate, at: 2026-09-25T00:00:00Z }
---

Sandbox containers are cut off from the cloud metadata server by a host firewall rule (DNS excepted) and Docker run flags are refused, because model-written code could otherwise act as the VM identity.

## Why

DNS answers carry no credential; tokens come only from the metadata web service. Refusing all extra run args closes container-escape flags without an allow-list to maintain.

## Context

A host firewall table drops forwarded traffic from the Docker bridge to the metadata address, except DNS (the same address is the VM's resolver). It loads before Docker starts and the boot script refuses to start without it. The sandbox manifest refuses any extra docker run arguments; a flag needed later becomes a typed field. Accepted residual risks for the pilot: shared kernel, open egress, the server holds the Docker socket, one VM identity.

Measured: a sandbox container on the default bridge could read the VM service account and its token from the metadata address, so model-written code could use every secret and bucket the VM can.
