---
name: tool-result-files-served-from-harness-origin
kind: verdicts
description: The harness serves the tools server's result files from its own origin through an authenticated, name-checked proxy route with isolation headers, and the chat UI rewrites bare file-name links to that route.
status: accepted
tags: [agent-forge, mcp, security, ui]
date: 2026-09-26
source: forge A25
---

# Serve tool result files from the harness origin

## Context

Tools return a bare file name served on the internal compose network only, so links the model wrote returned 404 in the browser.

## Decision

Add a GET/HEAD route behind the normal auth that accepts one decoded path segment matching the tools server's own name rule and its three file extensions, fetches the file without following redirects, and passes only status, type and length. Every answer carries nosniff; HTML carries a sandboxing CSP with no scripts; CSV and JSONL are downloads. The UI link renderer rewrites a bare relative name to the route at render time.

## Why

Files open where the user is, without exposing the tools server. A report cannot run script against the API.
