---
name: mcp-client-registration-cimd-only
kind: verdicts
description: MCP clients register only through Client ID Metadata Documents, with no Dynamic Client Registration endpoint; the newest MCP revision is native and the previous era is still accepted, with a batch cap.
status: accepted
tags: [mcp, oauth, auth, security]
date: 2026-09-03
source: hub M2
---

# CIMD only, no dynamic client registration

## Context

The MCP authorization spec (revision 2026-07-28) marks Dynamic Client Registration (DCR) as deprecated and
names Client ID Metadata Documents (CIMD) as the SHOULD. ChatGPT documents CIMD as its preferred path.
The first draft also refused every older MCP protocol revision.

## Decision

- CIMD only. No DCR, no `/register` endpoint.
- Only the 2.x line of the official MCP server SDK; the 1.x SDK never enters the repo.
- Protocol: the 2026-07-28 revision is native, and the 2025 era is accepted through the SDK's stateless
  legacy mode, from the same tool factory, with the same verified auth info (amended 2026-09-05).
- The legacy transport processes JSON-RPC arrays and caps nothing, so the access hub counts batch messages
  itself before the SDK sees them (a config value, 8 by default).
- Every request logs its announced revision, so the legacy leg can be dropped on evidence.

## Why

- Removing DCR removes an unauthenticated write endpoint, its rate limit, stored client records and
  registration-token rotation.
- Refusing old revisions was a guess about clients. A current first-party desktop MCP client connected,
  passed the whole OAuth flow, and announced revision 2025-06-18. That log line is the evidence; the
  next surprise should be a config change, not a deploy.
