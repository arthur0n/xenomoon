---
type: verdicts
title: Keep-first archive, generation-pinned queue
description: The raw archive is written keep-first with a create-only condition, queue objects are read and deleted by generation, and a queue file is written whole in one save or not at all.
status: stable
tags: [storage, etl]
source: warehouse storage
generated: { by: human:migrate, at: 2026-10-13T00:00:00Z }
---

The raw archive is written keep-first with a create-only condition, queue objects are read and deleted by generation, and a queue file is written whole in one save or not at all.

## Why

The archive is the replay source and must never change; the queue must never act on the wrong object.

## Context

Archive uploads use a create-only condition and treat 'already exists' as success. Queue reads and deletes are pinned to the object generation seen. Each queue file is one save. Retries live in the client and are used only where repeating is safe (same bytes to a fixed name, or keep-first).

A slow run could import or delete a newer object with the same name, and a partial write could look like a complete export.
