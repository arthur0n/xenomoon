---
name: mcp-result-files-embedded-resource
kind: verdicts
description: Agent result files reach MCP clients as an EmbeddedResource from a read_file tool, owned through the job and capped on raw bytes, because ChatGPT is a tools-only client and this needs no URI scheme or file route.
status: accepted
tags: [mcp, security]
date: 2026-09-05
source: hub M15
---

# Result files as embedded resources, job-owned and capped

## Context

Agent runs produce files (reports, exports). A plan assumed a custom URI scheme read through
`resources/read`, but the vendor's MCP docs describe a tools-only contract and it is unknown whether
ChatGPT implements `resources/read`.

## Decision

- `get_result` lists the file names a run produced, never bytes.
- `read_file({job, file})` returns one file as an MCP `EmbeddedResource` content block (base64 `blob`
  nested under `resource`).
- Ownership is job ownership: the file must be on that job's list, and the job must belong to the caller
  and agent. Foreign job, unknown job, unlisted name or unfinished job all get the same refusal.
- The cap is on raw bytes (base64 inflates 4/3), counted on bytes received, never on `Content-Length`. An
  oversized file answers an `isError` result naming the cap. No `resources/read`, no file route.
- The `uri` is a path-only label that nothing dereferences.

## Why

Bearer-checked and ownership-checked by construction, no handle store, no expiry policy, and it works on a
tools-only client. `resources/read` is added later only when a real client asks for it. The browser path
for files keeps its own session plus ACL gate.
