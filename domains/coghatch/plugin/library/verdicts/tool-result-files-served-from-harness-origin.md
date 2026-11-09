---
type: verdicts
title: Serve tool result files from the harness origin
description: The harness serves the tools server's result files from its own origin through an authenticated, name-checked proxy route with isolation headers, and the chat UI rewrites bare file-name links to that route.
status: stable
tags: [agent-forge, mcp, security, ui]
source: forge A25
generated: { by: human:migrate, at: 2026-09-26T00:00:00Z }
---

The harness serves the tools server's result files from its own origin through an authenticated, name-checked proxy route with isolation headers, and the chat UI rewrites bare file-name links to that route.

## Why

Files open where the user is, without exposing the tools server. A report cannot run script against the API.

## Context

Add a GET/HEAD route behind the normal auth that accepts one decoded path segment matching the tools server's own name rule and its three file extensions, fetches the file without following redirects, and passes only status, type and length. Every answer carries nosniff; HTML carries a sandboxing CSP with no scripts; CSV and JSONL are downloads. The UI link renderer rewrites a bare relative name to the route at render time.

Tools return a bare file name served on the internal compose network only, so links the model wrote returned 404 in the browser.
