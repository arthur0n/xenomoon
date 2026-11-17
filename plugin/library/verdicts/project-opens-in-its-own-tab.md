---
type: verdicts
title: project-opens-in-its-own-tab
description: Clicking a project on the hub page opens that project's own page in a new browser tab; the hub never shows it in a frame.
status: stable
tags: [hub, architecture, ui]
generated: { by: human:arthur0n, at: 2026-11-17T14:56:09.885Z }
supersedes: [project-tab-is-an-iframe-with-status]
---

Clicking a project on the hub page opens that project's own page in a new browser tab; the hub never shows it in a frame.

## Why

The owner said "I don't want to use like iframe" and decided that clicking a project opens its page in its own browser tab.
The hub page talks only to the hub.
A project that is off is started first.

## Rejected

A project's page inside an iframe on the hub page.

## Consequences

Project servers need no `frame-ancestors` or cross-origin status headers for the hub.
The page of a project is at `http://127.0.0.1:<port>/`.
