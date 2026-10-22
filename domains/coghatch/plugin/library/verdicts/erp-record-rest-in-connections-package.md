---
name: erp-record-rest-in-connections-package
kind: verdicts
description: ERP record REST access lives in the shared connections package as a generic authenticated GET plus named per-resource readers and a generic verbatim create, because vendor paths and record shapes are connector shape, not domain content.
status: accepted
tags: [connections]
date: 2026-09-05
source: platform D15
---

# ERP record REST in the connections package

## Context

A pipeline needed ERP record reads beyond SQL queries. Options: consumer-built URLs, a SQL join, or the
package.

## Decision

The package exposes a generic authenticated GET on the record API, named per-resource read functions (both
fetch shapes, sub-resource expansion as a parameter, off by default), and a generic `createRecord(path,
body)` that POSTs the body verbatim (no mapping, no defaults) and returns status, internal id and location.
The internal id is taken from the `Location` header only when it has the id shape; otherwise `null` with the
raw location kept. No named create wrappers: the consumer names its path. Each vendor folder's root is its
core (auth, http, errors), and each service is a nested folder with one file per method and its own tests.
Which record and what to do with it stay in the pipeline or agent.

## Why

- One transport and one test set, reused by agents and pipelines.
- Shipped as a patch of the internal package; consumers on a caret range pick it up without edits.
