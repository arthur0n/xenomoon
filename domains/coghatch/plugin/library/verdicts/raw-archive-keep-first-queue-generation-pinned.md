---
name: raw-archive-keep-first-queue-generation-pinned
kind: verdicts
description: The raw archive is written keep-first with a create-only condition, queue objects are read and deleted by generation, and a queue file is written whole in one save or not at all.
status: accepted
tags: [storage, etl]
date: 2026-10-13
source: warehouse storage
---

# Keep-first archive, generation-pinned queue

## Context

A slow run could import or delete a newer object with the same name, and a partial write could look like a complete export.

## Decision

Archive uploads use a create-only condition and treat 'already exists' as success. Queue reads and deletes are pinned to the object generation seen. Each queue file is one save. Retries live in the client and are used only where repeating is safe (same bytes to a fixed name, or keep-first).

## Why

The archive is the replay source and must never change; the queue must never act on the wrong object.
