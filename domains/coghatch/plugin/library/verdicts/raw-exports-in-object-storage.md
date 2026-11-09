---
type: verdicts
title: Raw exports in object storage
description: Raw exports are staged in the cloud's object storage, not a consumer drive, and old files go to cold storage by lifecycle rather than being offloaded to save cents.
status: stable
tags: [storage, data-warehouse, cost]
source: warehouse convention
generated: { by: human:migrate, at: 2026-08-18T00:00:00Z }
---

Raw exports are staged in the cloud's object storage, not a consumer drive, and old files go to cold storage by lifecycle rather than being offloaded to save cents.

## Why

A drive adds an auth surface and a shared quota whose fill-up breaks email; offloading saves cents and adds a second store to the replay path.

## Context

Stage raw exports in object storage, which the warehouse load reads directly under the same IAM and budget alert. Do not offload old files elsewhere; a 90-day cold-storage lifecycle handles age.

A consumer drive was an option for raw files and for offloading old ones.
