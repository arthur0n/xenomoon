---
type: verdicts
title: Copy sandbox files out after every exec
description: Files a sandbox writes are copied to object storage after every command and upload, never overwriting, and shared by a signed read link whose expiry equals the bucket lifecycle.
status: stable
tags: [agent-forge, sandbox, storage]
source: forge A5
generated: { by: human:migrate, at: 2026-09-22T00:00:00Z }
---

Files a sandbox writes are copied to object storage after every command and upload, never overwriting, and shared by a signed read link whose expiry equals the bucket lifecycle.

## Why

Nothing is lost on a crash, and the link is ready when the answer is written. No key file exists to leak.

## Context

After every exec and every upload, list files changed since a marker and upload them with a create-only condition (never overwrite). The link is a signed read URL made with the VM identity through the IAM sign API, no key file. The bucket lifecycle equals the link expiry. Dotfiles, skill files and the harness's own files are excluded.

A sandbox container is a working copy and can vanish. Users need a link to files the agent produced, and the link must exist before the answer is sent.
