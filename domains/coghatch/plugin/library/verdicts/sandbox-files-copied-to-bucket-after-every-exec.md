---
name: sandbox-files-copied-to-bucket-after-every-exec
kind: verdicts
description: Files a sandbox writes are copied to object storage after every command and upload, never overwriting, and shared by a signed read link whose expiry equals the bucket lifecycle.
status: accepted
tags: [agent-forge, sandbox, storage]
date: 2026-09-22
source: forge A5
---

# Copy sandbox files out after every exec

## Context

A sandbox container is a working copy and can vanish. Users need a link to files the agent produced, and the link must exist before the answer is sent.

## Decision

After every exec and every upload, list files changed since a marker and upload them with a create-only condition (never overwrite). The link is a signed read URL made with the VM identity through the IAM sign API, no key file. The bucket lifecycle equals the link expiry. Dotfiles, skill files and the harness's own files are excluded.

## Why

Nothing is lost on a crash, and the link is ready when the answer is written. No key file exists to leak.
